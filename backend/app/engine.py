"""The deterministic engine.

It owns all arithmetic, the permitted factual grammar, complete occurrence
coverage, freshness and authority checks, and the release invariants. No model
supplies a number, a factual sentence, a reviewer, or the publication scope.

Arithmetic is exact: integer cents in, `Fraction` throughout, rounding only for
display under a pinned half-up rule. Direction is decided on the exact signed
difference, never on rounded text.
"""

from __future__ import annotations

import csv
from dataclasses import dataclass, field
from fractions import Fraction
from pathlib import Path
from typing import Any

from . import domain
from .graph import GraphClient


class EngineHold(RuntimeError):
    """A deterministic refusal: the state cannot support a supported assertion.

    Holding is not the same as being false. It narrows the permitted actions.
    """

    def __init__(self, code: str, detail: str, context: dict[str, Any] | None = None) -> None:
        super().__init__(detail)
        self.code = code
        self.detail = detail
        self.context = context or {}


# -- exact arithmetic ---------------------------------------------------------


def round_half_up(value: Fraction) -> int:
    """Pinned display rule. Ties move away from zero, symmetrically."""
    if value >= 0:
        return int((value * 2 + 1) // 2)
    return -int(((-value) * 2 + 1) // 2)


def format_dollars(cents: int) -> str:
    return f"${cents // 100}.{cents % 100:02d}"


def format_cents(cents: int) -> str:
    return f"{cents} cents" if cents != 1 else "1 cent"


# -- evidence -----------------------------------------------------------------


@dataclass(frozen=True)
class BatchFact:
    batch_id: str
    cost_cents: int
    lane_id: str


@dataclass(frozen=True)
class EvidenceSnapshot:
    """Immutable measurements plus the effective memberships behind them."""

    dataset_id: str
    raw_sha: str
    batches: tuple[BatchFact, ...]

    def memberships(self) -> list[list[Any]]:
        return [[b.batch_id, b.lane_id, b.cost_cents] for b in self.batches]

    def membership_sha(self) -> str:
        return domain.canonical_sha(self.memberships())


def read_immutable_costs(csv_path: Path) -> dict[str, int]:
    """Read the frozen CSV. These bytes substantiate the imported values."""
    with csv_path.open(newline="", encoding="utf-8") as handle:
        rows = list(csv.DictReader(handle))
    costs: dict[str, int] = {}
    for row in rows:
        batch_id = row["batch_id"].strip()
        if batch_id in costs:
            raise EngineHold("DATASET_DUPLICATE_ROW", f"{batch_id} appears twice in the CSV")
        costs[batch_id] = int(row["cost_cents"])
    return costs


def load_evidence(graph: GraphClient, csv_path: Path, dataset_id: str) -> EvidenceSnapshot:
    """Effective evidence from the graph, cross-checked against the raw CSV.

    Exactly one dataset membership and exactly one lane assignment per batch.
    Anything else is a hold, never an average over a duplicate edge.
    """
    rows = graph.effective_evidence(dataset_id)
    if not rows:
        raise EngineHold("DATASET_MISSING", f"dataset {dataset_id} has no batches")

    raw_sha = rows[0]["raw_sha"]
    expected_count = rows[0]["expected_batch_count"]

    membership_edges: dict[str, set[int]] = {}
    assignment_edges: dict[str, set[int]] = {}
    lanes: dict[str, set[str | None]] = {}
    costs: dict[str, set[int]] = {}
    for row in rows:
        batch_id = row["batch_id"]
        membership_edges.setdefault(batch_id, set()).add(row["membership_edge_id"])
        lanes.setdefault(batch_id, set()).add(row["lane_id"])
        costs.setdefault(batch_id, set()).add(row["cost_cents"])
        if row["assignment_edge_id"] is not None:
            assignment_edges.setdefault(batch_id, set()).add(row["assignment_edge_id"])

    for batch_id, edges in membership_edges.items():
        if len(edges) != 1:
            raise EngineHold(
                "DUPLICATE_DATASET_MEMBERSHIP",
                f"{batch_id} is linked to the dataset {len(edges)} times",
            )
    for batch_id in membership_edges:
        count = len(assignment_edges.get(batch_id, set()))
        if count == 0:
            raise EngineHold("MISSING_ASSIGNMENT", f"{batch_id} has no effective lane")
        if count > 1:
            raise EngineHold(
                "DUPLICATE_ASSIGNMENT", f"{batch_id} has {count} effective lane assignments"
            )

    if len(membership_edges) != expected_count:
        raise EngineHold(
            "DATASET_INVENTORY_MISMATCH",
            f"expected {expected_count} batches, found {len(membership_edges)}",
        )

    immutable = read_immutable_costs(csv_path)
    if set(immutable) != set(membership_edges):
        raise EngineHold(
            "DATASET_INVENTORY_MISMATCH", "graph batch inventory disagrees with the raw CSV"
        )
    for batch_id, values in costs.items():
        if len(values) != 1 or next(iter(values)) != immutable[batch_id]:
            raise EngineHold(
                "MEASUREMENT_MISMATCH", f"{batch_id} cost disagrees with the raw CSV"
            )

    facts = tuple(
        BatchFact(batch_id, immutable[batch_id], next(iter(lanes[batch_id])))  # type: ignore[arg-type]
        for batch_id in sorted(membership_edges)
    )
    return EvidenceSnapshot(dataset_id=dataset_id, raw_sha=raw_sha, batches=facts)


# -- comparison definition ----------------------------------------------------


@dataclass(frozen=True)
class ComparisonDefinition:
    comparison_id: str
    metric_key: str
    min_n: int
    display_precision: int
    dataset_id: str
    left_lane_id: str
    left_lane_name: str
    right_lane_id: str
    right_lane_name: str
    owner_id: str | None
    owner_name: str | None


def load_comparison(graph: GraphClient, comparison_id: str) -> ComparisonDefinition:
    rows = graph.comparison(comparison_id)
    if not rows:
        raise EngineHold("COMPARISON_MISSING", f"comparison {comparison_id} not found")
    if len(rows) != 1:
        raise EngineHold(
            "DUPLICATE_PROVENANCE",
            f"comparison {comparison_id} has duplicate definition relationships",
        )
    row = rows[0]
    for alias, code in (
        ("source_edge_id", "MISSING_DATASET_SOURCE"),
        ("left_edge_id", "MISSING_COMPARISON_SIDE"),
        ("right_edge_id", "MISSING_COMPARISON_SIDE"),
    ):
        if row[alias] is None:
            raise EngineHold(code, f"comparison {comparison_id} is missing {alias}")
    if row["metric_key"] not in domain.ALLOWED_METRIC_KEYS:
        raise EngineHold("METRIC_NOT_ALLOWED", f"metric {row['metric_key']} is not allowlisted")
    if row["left_lane_id"] == row["right_lane_id"]:
        raise EngineHold("COMPARISON_SIDES_IDENTICAL", "both sides name the same lane")
    return ComparisonDefinition(
        comparison_id=row["comparison_id"],
        metric_key=row["metric_key"],
        min_n=int(row["min_n"]),
        display_precision=int(row["display_precision"]),
        dataset_id=row["dataset_id"],
        left_lane_id=row["left_lane_id"],
        left_lane_name=row["left_lane_name"],
        right_lane_id=row["right_lane_id"],
        right_lane_name=row["right_lane_name"],
        owner_id=row["owner_id"],
        owner_name=row["owner_name"],
    )


# -- exact comparison result --------------------------------------------------


@dataclass(frozen=True)
class SideAggregate:
    lane_id: str
    lane_name: str
    total_cents: int
    batch_count: int

    @property
    def mean(self) -> Fraction:
        return Fraction(self.total_cents, self.batch_count)

    @property
    def mean_display_cents(self) -> int:
        return round_half_up(self.mean)

    def as_dict(self) -> dict[str, Any]:
        return {
            "lane_id": self.lane_id,
            "lane_name": self.lane_name,
            "total_cents": self.total_cents,
            "batch_count": self.batch_count,
            "mean_numerator": self.mean.numerator,
            "mean_denominator": self.mean.denominator,
            "mean_display_cents": self.mean_display_cents,
        }


@dataclass(frozen=True)
class ComparisonResult:
    """The one exact answer. Subject is the right side, reference the left."""

    definition: ComparisonDefinition
    left: SideAggregate
    right: SideAggregate
    relation: str
    magnitude_cents: int
    hold_reason: str | None = None

    @property
    def subject_name(self) -> str:
        return self.right.lane_name

    @property
    def reference_name(self) -> str:
        return self.left.lane_name

    def as_dict(self) -> dict[str, Any]:
        return {
            "comparison_id": self.definition.comparison_id,
            "metric_key": self.definition.metric_key,
            "left": self.left.as_dict(),
            "right": self.right.as_dict(),
            "relation": self.relation,
            "magnitude_cents": self.magnitude_cents,
            "hold_reason": self.hold_reason,
        }


def compute_comparison(
    snapshot: EvidenceSnapshot, definition: ComparisonDefinition
) -> ComparisonResult:
    totals: dict[str, int] = {}
    counts: dict[str, int] = {}
    for batch in snapshot.batches:
        totals[batch.lane_id] = totals.get(batch.lane_id, 0) + batch.cost_cents
        counts[batch.lane_id] = counts.get(batch.lane_id, 0) + 1

    sides = {}
    for role, lane_id, lane_name in (
        ("left", definition.left_lane_id, definition.left_lane_name),
        ("right", definition.right_lane_id, definition.right_lane_name),
    ):
        count = counts.get(lane_id, 0)
        if count == 0:
            raise EngineHold("EMPTY_COMPARISON_SIDE", f"{lane_name} has no batches")
        sides[role] = SideAggregate(lane_id, lane_name, totals[lane_id], count)

    left, right = sides["left"], sides["right"]
    if left.batch_count < definition.min_n or right.batch_count < definition.min_n:
        return ComparisonResult(
            definition=definition,
            left=left,
            right=right,
            relation=domain.RELATION_WITHHELD,
            magnitude_cents=0,
            hold_reason="BELOW_MINIMUM_SAMPLE",
        )

    # Direction comes from the exact signed difference, not from rounded text.
    difference = right.mean - left.mean
    if difference == 0:
        return ComparisonResult(definition, left, right, domain.RELATION_EQUAL, 0)

    magnitude = round_half_up(abs(difference))
    if magnitude == 0:
        return ComparisonResult(
            definition=definition,
            left=left,
            right=right,
            relation=domain.RELATION_WITHHELD,
            magnitude_cents=0,
            hold_reason="BELOW_DISPLAY_RESOLUTION",
        )
    relation = domain.RELATION_HIGHER if difference > 0 else domain.RELATION_LOWER
    return ComparisonResult(definition, left, right, relation, magnitude)


# -- the finite factual grammar ----------------------------------------------


def typed_assertion(result: ComparisonResult, card_style: str) -> dict[str, Any]:
    """One whole card, from a closed template. Never a patched text span."""
    if card_style not in domain.ALLOWED_CARD_STYLES:
        raise EngineHold("CARD_STYLE_NOT_ALLOWED", f"style {card_style} is not allowlisted")

    subject, reference = result.subject_name, result.reference_name
    magnitude = result.magnitude_cents
    unit = "USD_PER_PARCEL" if card_style == "DOLLARS" else "CENTS_PER_PARCEL"
    amount = format_dollars(magnitude) if card_style == "DOLLARS" else format_cents(magnitude)

    if result.relation == domain.RELATION_WITHHELD:
        text = (
            f"Comparison withheld: {subject} versus {reference} mean cost per parcel "
            f"cannot be stated ({result.hold_reason})."
        )
    elif result.relation == domain.RELATION_EQUAL:
        text = f"{subject} and {reference} have equal mean cost per parcel."
    elif card_style == "DOLLARS":
        direction = "more" if result.relation == domain.RELATION_HIGHER else "less"
        text = f"{subject} costs {amount} {direction} per parcel than {reference}."
    else:
        direction = (
            "more expensive" if result.relation == domain.RELATION_HIGHER else "cheaper"
        )
        text = f"{subject} is {amount} {direction} per parcel than {reference}."

    return {
        "subject": subject,
        "reference": reference,
        "relation": result.relation,
        "magnitude_cents": magnitude,
        "unit": unit,
        "card_style": card_style,
        "hold_reason": result.hold_reason,
        "text": text,
    }


# -- registered publication scope --------------------------------------------


@dataclass(frozen=True)
class OccurrenceRecord:
    occurrence_id: str
    document_id: str
    claim_id: str
    comparison_id: str
    card_style: str
    block_id: str
    original_assertion: dict[str, Any]


@dataclass
class DocumentRecord:
    document_id: str
    title: str
    template: str
    owner_id: str | None
    owner_name: str | None
    source_revision: int
    source_sha: str
    blocks: list[dict[str, Any]]
    occurrences: list[OccurrenceRecord] = field(default_factory=list)


@dataclass(frozen=True)
class PackageScope:
    """Every registered card in the package, enumerated by the engine itself.

    A caller cannot narrow this. The second report cannot be silently excluded.
    """

    documents: tuple[DocumentRecord, ...]

    @property
    def occurrences(self) -> tuple[OccurrenceRecord, ...]:
        return tuple(occ for doc in self.documents for occ in doc.occurrences)

    def document(self, document_id: str) -> DocumentRecord:
        for doc in self.documents:
            if doc.document_id == document_id:
                return doc
        raise EngineHold("DOCUMENT_UNKNOWN", f"document {document_id} is not registered")


def load_scope(graph: GraphClient) -> PackageScope:
    rows = graph.package_inventory()
    if not rows:
        raise EngineHold("PACKAGE_EMPTY", "no documents are registered in this workspace")

    documents: dict[str, DocumentRecord] = {}
    location_edges: dict[str, set[int]] = {}
    instance_edges: dict[str, set[int]] = {}
    binding_edges: dict[str, set[int]] = {}
    seen_occurrences: dict[str, str] = {}

    for row in rows:
        document_id = row["document_id"]
        if document_id not in documents:
            if row["ownership_edge_id"] is None:
                raise EngineHold("UNKNOWN_DOCUMENT_OWNER", f"{document_id} has no owner")
            documents[document_id] = DocumentRecord(
                document_id=document_id,
                title=row["document_title"],
                template=row["document_template"],
                owner_id=row["owner_id"],
                owner_name=row["owner_name"],
                source_revision=int(row["source_revision"]),
                source_sha=row["source_sha"],
                blocks=_decode_blocks(row["source_blocks"], document_id),
            )
        occurrence_id = row["occurrence_id"]
        if occurrence_id is None:
            continue
        location_edges.setdefault(occurrence_id, set()).add(row["location_edge_id"])
        if row["instance_edge_id"] is not None:
            instance_edges.setdefault(occurrence_id, set()).add(row["instance_edge_id"])
        if row["binding_edge_id"] is not None:
            binding_edges.setdefault(occurrence_id, set()).add(row["binding_edge_id"])
        if occurrence_id in seen_occurrences:
            if seen_occurrences[occurrence_id] != document_id:
                raise EngineHold(
                    "DUPLICATE_PROVENANCE",
                    f"occurrence {occurrence_id} is registered in several documents",
                )
            continue
        seen_occurrences[occurrence_id] = document_id
        if row["claim_id"] is None:
            raise EngineHold(
                "MISSING_PROVENANCE",
                f"occurrence {occurrence_id} has no approved finding binding",
            )
        if row["comparison_id"] is None:
            raise EngineHold(
                "MISSING_PROVENANCE",
                f"claim {row['claim_id']} is not bound to an approved comparison",
            )
        if row["card_style"] not in domain.ALLOWED_CARD_STYLES:
            raise EngineHold("CARD_STYLE_NOT_ALLOWED", f"occurrence {occurrence_id} style")
        documents[document_id].occurrences.append(
            OccurrenceRecord(
                occurrence_id=occurrence_id,
                document_id=document_id,
                claim_id=row["claim_id"],
                comparison_id=row["comparison_id"],
                card_style=row["card_style"],
                block_id=row["block_id"],
                original_assertion=_decode_json(row["original_assertion"]),
            )
        )

    for occurrence_id, edges in location_edges.items():
        if len(edges) != 1:
            raise EngineHold(
                "DUPLICATE_PROVENANCE", f"occurrence {occurrence_id} has {len(edges)} locations"
            )
        if len(instance_edges.get(occurrence_id, set())) != 1:
            raise EngineHold(
                "DUPLICATE_PROVENANCE", f"occurrence {occurrence_id} has a non-unique claim link"
            )
    for occurrence_id in location_edges:
        claim_bindings = binding_edges.get(occurrence_id, set())
        if len(claim_bindings) != 1:
            raise EngineHold(
                "DUPLICATE_PROVENANCE",
                f"the claim behind {occurrence_id} has {len(claim_bindings)} comparison bindings",
            )

    # Authored finding blocks and registered occurrences must agree exactly.
    for document in documents.values():
        authored = [b["id"] for b in document.blocks if b["kind"] == "finding"]
        registered = sorted(occ.block_id for occ in document.occurrences)
        if sorted(authored) != registered:
            raise EngineHold(
                "SCOPE_INVENTORY_MISMATCH",
                f"{document.document_id} authored finding blocks {sorted(authored)} "
                f"do not match registered occurrences {registered}",
            )
        document.occurrences.sort(key=lambda occ: occ.occurrence_id)

    return PackageScope(tuple(documents[key] for key in sorted(documents)))


def _decode_json(raw: Any) -> dict[str, Any]:
    import json

    if raw in (None, ""):
        return {}
    if isinstance(raw, dict):
        return raw
    return json.loads(raw)


def _decode_blocks(raw: Any, document_id: str) -> list[dict[str, Any]]:
    import json

    if not raw:
        raise EngineHold("DOCUMENT_BLOCKS_MISSING", f"{document_id} has no source blocks")
    blocks = json.loads(raw) if isinstance(raw, str) else raw
    seen: set[str] = set()
    for block in blocks:
        if block["id"] in seen:
            raise EngineHold("DUPLICATE_BLOCK_ID", f"{document_id} repeats block {block['id']}")
        seen.add(block["id"])
        if block["kind"] not in {"narrative", "finding", "decision"}:
            raise EngineHold("BLOCK_KIND_NOT_ALLOWED", f"{document_id} block {block['id']}")
    return blocks


# -- decision and current review authority ------------------------------------


@dataclass(frozen=True)
class AuthorityContext:
    decision_id: str
    decision_title: str
    decision_status: str
    basis_claim_id: str | None
    team_id: str | None
    team_name: str | None
    reviewer_id: str
    reviewer_name: str


def load_authority(graph: GraphClient, decision_id: str) -> AuthorityContext:
    """Resolve exactly one current reviewer. Ownership is never substituted."""
    rows = graph.decision_authority(decision_id)
    if not rows:
        raise EngineHold("DECISION_MISSING", f"decision {decision_id} not found")

    basis = {row["basis_edge_id"] for row in rows if row["basis_edge_id"] is not None}
    ownership = {row["ownership_edge_id"] for row in rows if row["ownership_edge_id"] is not None}
    authority = {row["authority_edge_id"] for row in rows if row["authority_edge_id"] is not None}
    reviewers = {row["reviewer_id"] for row in rows if row["reviewer_id"] is not None}

    if len(basis) > 1 or len(ownership) > 1:
        raise EngineHold("DUPLICATE_PROVENANCE", "the decision has duplicate basis or ownership")
    if not authority or not reviewers:
        raise EngineHold("NO_REVIEWER", "the owning team has no current reviewer")
    if len(authority) > 1 or len(reviewers) > 1:
        raise EngineHold("AMBIGUOUS_REVIEWER", f"{len(reviewers)} current review paths")

    row = rows[0]
    return AuthorityContext(
        decision_id=row["decision_id"],
        decision_title=row["decision_title"],
        decision_status=row["decision_status"],
        basis_claim_id=row["basis_claim_id"],
        team_id=row["team_id"],
        team_name=row["team_name"],
        reviewer_id=row["reviewer_id"],
        reviewer_name=row["reviewer_name"],
    )


# -- the assembled case context ----------------------------------------------


@dataclass(frozen=True)
class CaseContext:
    """One consistent read of everything a plan depends on."""

    context_revision: int
    prior_release_id: str
    evidence: EvidenceSnapshot
    definition: ComparisonDefinition
    result: ComparisonResult
    scope: PackageScope
    authority: AuthorityContext

    def assessment(self) -> list[dict[str, Any]]:
        """Compare current evidence with each previously published assertion.

        Numeric freshness and relation freshness are separate: an unchanged
        40-cent magnitude can still require a direction change.
        """
        out = []
        for occ in self.scope.occurrences:
            current = typed_assertion(self.result, occ.card_style)
            previous = occ.original_assertion
            out.append(
                {
                    "occurrence_id": occ.occurrence_id,
                    "document_id": occ.document_id,
                    "block_id": occ.block_id,
                    "card_style": occ.card_style,
                    "previous": previous,
                    "current": current,
                    "relation_changed": previous.get("relation") != current["relation"],
                    "magnitude_changed": previous.get("magnitude_cents")
                    != current["magnitude_cents"],
                }
            )
        return out


def load_case_context(
    graph: GraphClient, csv_path: Path, *, decision_id: str, comparison_id: str
) -> CaseContext:
    """Read authoritative context once, under the caller's workspace lock."""
    workspace = graph.workspace(domain.WORKSPACE_ID)
    definition = load_comparison(graph, comparison_id)
    evidence = load_evidence(graph, csv_path, definition.dataset_id)
    result = compute_comparison(evidence, definition)
    scope = load_scope(graph)
    authority = load_authority(graph, decision_id)
    return CaseContext(
        context_revision=int(workspace["context_revision"]),
        prior_release_id=workspace["current_release_id"] or "",
        evidence=evidence,
        definition=definition,
        result=result,
        scope=scope,
        authority=authority,
    )


# -- identity: content versus permission --------------------------------------


def content_identity(
    context: CaseContext, *, goal: str, disposition: str, alternative_flag: bool
) -> dict[str, Any]:
    """Everything that determines the candidate bytes.

    A reviewer change leaves this identical; an evidence, source, binding,
    ownership, basis, intent, or template change does not.
    """
    return {
        "template_version": domain.TEMPLATE_VERSION,
        "dataset": {
            "id": context.evidence.dataset_id,
            "raw_sha": context.evidence.raw_sha,
            "memberships": context.evidence.memberships(),
        },
        "comparison": {
            "id": context.definition.comparison_id,
            "metric_key": context.definition.metric_key,
            "left_lane_id": context.definition.left_lane_id,
            "right_lane_id": context.definition.right_lane_id,
            "min_n": context.definition.min_n,
            "display_precision": context.definition.display_precision,
            "owner_id": context.definition.owner_id,
        },
        "result": context.result.as_dict(),
        "documents": [
            {
                "id": doc.document_id,
                "template": doc.template,
                "owner_id": doc.owner_id,
                "source_revision": doc.source_revision,
                "source_sha": doc.source_sha,
                "blocks": doc.blocks,
            }
            for doc in context.scope.documents
        ],
        "occurrences": [
            {
                "id": occ.occurrence_id,
                "document_id": occ.document_id,
                "claim_id": occ.claim_id,
                "comparison_id": occ.comparison_id,
                "card_style": occ.card_style,
                "block_id": occ.block_id,
            }
            for occ in context.scope.occurrences
        ],
        "decision": {
            "id": context.authority.decision_id,
            "basis_claim_id": context.authority.basis_claim_id,
            "disposition": disposition,
            "resulting_status": domain.DISPOSITION_DECISION_STATUS[disposition],
        },
        "intent": {"goal": goal, "alternative_flag": alternative_flag},
    }


def execution_identity(
    *,
    content_hash: str,
    candidate_hashes: dict[str, str],
    reviewer_id: str,
    context_revision: int,
    plan_version: int,
    prior_release_id: str,
) -> dict[str, Any]:
    """Content identity plus who may act and against which world state."""
    return {
        "content_hash": content_hash,
        "candidates": sorted(candidate_hashes.items()),
        "reviewer_id": reviewer_id,
        "context_revision": context_revision,
        "plan_version": plan_version,
        "prior_release_id": prior_release_id,
    }


# -- intent validation --------------------------------------------------------


def validate_intent(goal: str, disposition: str, alternative_flag: bool) -> None:
    """Typed intent only. Retaining a contradicted claim is never an output."""
    if goal not in domain.ALLOWED_GOALS:
        raise EngineHold("GOAL_NOT_ALLOWED", f"goal {goal} is not in the typed grammar")
    if disposition not in domain.ALLOWED_DISPOSITIONS:
        raise EngineHold("DISPOSITION_NOT_ALLOWED", f"disposition {disposition}")
    if goal == domain.GOAL_UNKNOWN:
        raise EngineHold(
            "CLARIFICATION_REQUIRED", "a required goal is unknown; ask one focused question"
        )
    if goal == domain.GOAL_RETAIN_CHEAPER_CLAIM and not alternative_flag:
        raise EngineHold(
            "UNSUPPORTED_ASSERTION_REQUESTED",
            "retaining a contradicted cheaper claim requires an explicitly proposed alternative",
        )
