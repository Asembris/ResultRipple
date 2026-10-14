"""Rendering, staging, and immutable edition files.

Rendering is autoescaped and whole-card: a factual block is produced from a
closed template or not at all. Candidate bytes are fixed before hashing and
contain no reviewer identity, approval metadata, issue time, or self-hash, so a
reviewer-only refresh can preserve them exactly.

The commit protocol here is a local filesystem protocol, not a distributed
transaction with the graph. Before the pointer commit a crash can leave private
orphans; after it, referenced files must exist and hash-match.
"""

from __future__ import annotations

import os
import shutil
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from jinja2 import Environment, FileSystemLoader, StrictUndefined, select_autoescape

from . import domain
from .engine import (
    CaseContext,
    EngineHold,
    format_cents,
    format_dollars,
    typed_assertion,
)

TEMPLATE_DIR = Path(__file__).resolve().parent / "templates"

# Only these two layouts exist. A document cannot name an arbitrary file.
ALLOWED_TEMPLATES = {
    "operations_cost_review": "operations_cost_review.html",
    "south_expansion_memo": "south_expansion_memo.html",
}

ORGANIZATION = "ParcelLine Logistics — fictional demo organization"

DECISION_STATUS_LABELS = {
    "PROPOSED": "Proposed",
    "RETURNED_FOR_REVIEW": "Returned for review",
}

_environment = Environment(
    loader=FileSystemLoader(TEMPLATE_DIR),
    autoescape=select_autoescape(default_for_string=True, default=True),
    undefined=StrictUndefined,
    keep_trailing_newline=True,
)


@dataclass(frozen=True)
class RenderedPackage:
    """Deterministic bytes for every document, plus their hashes."""

    edition_id: str
    documents: dict[str, bytes]

    def hashes(self) -> dict[str, str]:
        return {doc_id: domain.sha256_bytes(body) for doc_id, body in self.documents.items()}


def edition_id_for(content_hash: str) -> str:
    """Derived from candidate-content identity, so refresh preserves bytes."""
    return f"ed-{content_hash[:12]}"


def render_package(
    context: CaseContext, *, disposition: str, content_hash: str
) -> RenderedPackage:
    """Render every registered document from the current authoritative context."""
    if disposition not in domain.DISPOSITION_DECISION_STATUS:
        raise EngineHold("DISPOSITION_NOT_RENDERABLE", f"disposition {disposition}")

    result = context.result
    decision_status = domain.DISPOSITION_DECISION_STATUS[disposition]
    edition = {
        "edition_id": edition_id_for(content_hash),
        "template_version": domain.TEMPLATE_VERSION,
        "organization": ORGANIZATION,
        "dataset_sha": context.evidence.raw_sha,
        "membership_sha": context.evidence.membership_sha(),
        "scope_statement": domain.VERIFICATION_SCOPE_STATEMENT,
    }
    decision = {
        "decision_id": context.authority.decision_id,
        "title": context.authority.decision_title,
        "status": decision_status,
        "status_label": DECISION_STATUS_LABELS[decision_status],
        "basis_claim_id": context.authority.basis_claim_id,
    }

    rendered: dict[str, bytes] = {}
    for document in context.scope.documents:
        template_name = ALLOWED_TEMPLATES.get(document.template)
        if template_name is None:
            raise EngineHold("TEMPLATE_NOT_ALLOWED", f"{document.template} is not a layout")

        cards: dict[str, dict[str, Any]] = {}
        for occurrence in document.occurrences:
            assertion = typed_assertion(result, occurrence.card_style)
            cards[occurrence.block_id] = {
                "occurrence_id": occurrence.occurrence_id,
                "claim_id": occurrence.claim_id,
                "assertion": assertion,
                "left_name": result.left.lane_name,
                "right_name": result.right.lane_name,
                "left_display": _display(result.left.mean_display_cents, occurrence.card_style),
                "right_display": _display(result.right.mean_display_cents, occurrence.card_style),
                "left_count": result.left.batch_count,
                "right_count": result.right.batch_count,
                "comparison_id": context.definition.comparison_id,
                "dataset_id": context.definition.dataset_id,
                "min_n": context.definition.min_n,
            }

        body = _environment.get_template(template_name).render(
            document={
                "document_id": document.document_id,
                "title": document.title,
                "owner_name": document.owner_name,
            },
            blocks=document.blocks,
            cards=cards,
            decision=decision,
            edition=edition,
        )
        rendered[document.document_id] = body.encode("utf-8")

    return RenderedPackage(edition_id=edition["edition_id"], documents=rendered)


def _display(cents: int, card_style: str) -> str:
    return format_dollars(cents) if card_style == "DOLLARS" else format_cents(cents)


# -- filesystem -------------------------------------------------------------


class ArtifactStore:
    """Staged candidates and immutable issued editions on one volume."""

    def __init__(self, root: Path) -> None:
        self.root = root
        self.candidates = root / "candidates"
        self.releases = root / "releases"
        self.staging = root / "staging"
        for directory in (self.candidates, self.releases, self.staging):
            directory.mkdir(parents=True, exist_ok=True)

    # Candidates are private drafts. They may be overwritten by a restage.
    def write_candidates(self, plan_id: str, package: RenderedPackage) -> dict[str, str]:
        target = self.candidates / _safe_segment(plan_id)
        if target.exists():
            shutil.rmtree(target)
        target.mkdir(parents=True)
        paths = {}
        for document_id, body in package.documents.items():
            path = target / f"{_safe_segment(document_id)}.html"
            _write_fsync(path, body)
            paths[document_id] = str(path.relative_to(self.root).as_posix())
        _fsync_dir(target)
        return paths

    def candidate_path(self, plan_id: str, document_id: str) -> Path:
        return self.candidates / _safe_segment(plan_id) / f"{_safe_segment(document_id)}.html"

    def release_path(self, release_id: str, document_id: str) -> Path:
        return self.releases / _safe_segment(release_id) / f"{_safe_segment(document_id)}.html"

    def issue(self, release_id: str, package: RenderedPackage) -> dict[str, str]:
        """Write the whole package, then rename it into place as one directory.

        An incomplete release directory is never visible under `releases/`.
        """
        release_dir = self.releases / _safe_segment(release_id)
        if release_dir.exists():
            # A retry of a committed operation re-uses the existing bytes.
            return {
                document_id: str(
                    (release_dir / f"{_safe_segment(document_id)}.html")
                    .relative_to(self.root)
                    .as_posix()
                )
                for document_id in package.documents
            }

        staging_dir = self.staging / _safe_segment(release_id)
        if staging_dir.exists():
            shutil.rmtree(staging_dir)
        staging_dir.mkdir(parents=True)
        for document_id, body in package.documents.items():
            _write_fsync(staging_dir / f"{_safe_segment(document_id)}.html", body)
        _fsync_dir(staging_dir)
        os.replace(staging_dir, release_dir)
        _fsync_dir(self.releases)
        return {
            document_id: str(
                (release_dir / f"{_safe_segment(document_id)}.html")
                .relative_to(self.root)
                .as_posix()
            )
            for document_id in package.documents
        }

    def read(self, relative_path: str) -> bytes:
        """Read one artifact by a path that came from the graph, never a request."""
        resolved = (self.root / relative_path).resolve()
        if not resolved.is_relative_to(self.root.resolve()):
            raise EngineHold("ARTIFACT_PATH_REJECTED", "path escapes the artifact volume")
        if not resolved.is_file():
            raise EngineHold("ARTIFACT_MISSING", f"{relative_path} is not on the volume")
        return resolved.read_bytes()


def _safe_segment(value: str) -> str:
    """Identifiers come from the graph; still refuse anything path-shaped."""
    if not value or any(character in value for character in '/\\:*?"<>| ') or ".." in value:
        raise EngineHold("ARTIFACT_PATH_REJECTED", f"unsafe path segment {value!r}")
    return value


def _write_fsync(path: Path, body: bytes) -> None:
    with open(path, "wb") as handle:
        handle.write(body)
        handle.flush()
        os.fsync(handle.fileno())


def _fsync_dir(path: Path) -> None:
    """Directory fsync where the platform supports it.

    Windows has no directory fsync; the durability window there is the one the
    filesystem gives after the file fsyncs above. Stated, not papered over.
    """
    if os.name != "posix":
        return
    fd = os.open(path, os.O_RDONLY)
    try:
        os.fsync(fd)
    finally:
        os.close(fd)
