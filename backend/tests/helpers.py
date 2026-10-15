"""Shared steps for the integration tests. Real endpoint calls only."""

from __future__ import annotations

import os
from html.parser import HTMLParser
from typing import Any, NoReturn

import pytest
from fastapi.testclient import TestClient

from app import domain

# GitHub Actions sets CI=true.
CI_VALUES = frozenset({"1", "true", "yes", "on"})


def running_in_ci() -> bool:
    return os.environ.get("CI", "").strip().lower() in CI_VALUES


def no_usable_graph(reason: str) -> NoReturn:
    """Skip locally, fail in CI.

    Almost every test here is an integration test against a real FalkorDB, so a
    run without one proves nothing. Locally that is worth skipping past. In CI
    it is the whole point of the job, and a suite that skipped its way to "10
    passed, 145 skipped" would report green for a build that tested nothing.
    """
    if running_in_ci():
        pytest.fail(f"{reason} (CI=true, so this is a failure, not a skip)", pytrace=False)
    pytest.skip(reason)

CORRECTION_REQUEST = (
    "Update the reports, but keep South as the cheaper option in the rollout memo."
)


def workspace(http: TestClient) -> dict[str, Any]:
    response = http.get("/workspace")
    assert response.status_code == 200, response.text
    return response.json()


def apply_correction(ari: TestClient, batch_ids: list[str] | None = None) -> dict[str, Any]:
    state = workspace(ari)
    return ari.post(
        f"/corrections/{domain.CASE_ID}/apply",
        json={
            "batch_ids": batch_ids or ["B09", "B10", "B11"],
            "expected_context_revision": state["context_revision"],
            "source_confirmed": True,
        },
    ).json()


def stage(
    ari: TestClient,
    *,
    goal: str = domain.GOAL_RETAIN_CHEAPER_CLAIM,
    disposition: str = domain.DISPOSITION_RETURN_FOR_REVIEW,
    alternative_flag: bool = True,
    key: str = "stage-1",
    focus: list[str] | None = None,
    case_id: str = domain.CASE_ID,
) -> dict[str, Any]:
    """Stage the main case: the requested cheaper claim is not supportable, so
    the recorded intent proposes corrected facts and returns the proposal."""
    return ari.post(
        f"/cases/{case_id}/stage-review",
        json={
            "raw_request": CORRECTION_REQUEST,
            "goal": goal,
            "disposition": disposition,
            "alternative_flag": alternative_flag,
            "note": "Corrected facts proposed; the South proposal is returned for review.",
            "focus_occurrence_ids": focus or [],
            "idempotency_key": key,
        },
    )


def approve(http: TestClient, plan: dict[str, Any], acknowledged: bool = True):
    return http.post(
        f"/plans/{plan['plan_id']}/approve",
        json={
            "plan_version": plan["version"],
            "execution_fingerprint": plan["execution_fingerprint"],
            "acknowledged_alternative": acknowledged,
        },
    )


def release(http: TestClient, plan_id: str, operation_id: str = "op-1"):
    return http.post(f"/plans/{plan_id}/release", json={"operation_id": operation_id})


def reassign(operator: TestClient, revision: int, to_person: str = domain.PERSON_SAM):
    return operator.post(
        "/demo/reviewer-assignment",
        json={
            "from_person_id": domain.PERSON_NOOR,
            "to_person_id": to_person,
            "expected_context_revision": revision,
        },
    )


def staged_plan(ari: TestClient, **kwargs) -> dict[str, Any]:
    response = stage(ari, **kwargs)
    assert response.status_code == 200, response.text
    return response.json()


# -- authoring ------------------------------------------------------------------

INITIAL_PUBLICATION_CASE_ID = "case-initial-publication"


def create_finding(
    ari: TestClient, revision: int, *, confirmed: bool = True, comparison_id: str | None = None
):
    return ari.post(
        "/findings",
        json={
            "comparison_id": comparison_id or domain.COMPARISON_ID,
            "expected_context_revision": revision,
            "confirmed_intended_comparison": confirmed,
        },
    )


def insert_linked_finding(
    ari: TestClient, document_id: str, claim_id: str, card_style: str, revision: int
):
    return ari.post(
        f"/documents/{document_id}/linked-findings",
        json={
            "claim_id": claim_id,
            "card_style": card_style,
            "expected_context_revision": revision,
        },
    )


def record_basis(
    ari: TestClient, claim_id: str, revision: int, *, confirmed: bool = True,
    decision_id: str = domain.DECISION_ID,
):
    return ari.post(
        f"/decisions/{decision_id}/basis",
        json={
            "claim_id": claim_id,
            "expected_context_revision": revision,
            "confirmed_basis": confirmed,
        },
    )


def author_everything(ari: TestClient) -> dict[str, Any]:
    """Register the finding, place it in every report, record the basis.

    Every ID, style and revision comes from a server response, as in the UI.
    """
    state = workspace(ari)
    finding = create_finding(ari, state["context_revision"])
    assert finding.status_code == 200, finding.text
    claim_id = finding.json()["claim_id"]
    revision = finding.json()["context_revision"]
    placements = []
    for document in state["scope"]:
        placed = insert_linked_finding(
            ari, document["document_id"], claim_id, document["approved_card_style"], revision
        )
        assert placed.status_code == 200, placed.text
        placements.append(placed.json())
        revision = placed.json()["context_revision"]
    basis = record_basis(ari, claim_id, revision)
    assert basis.status_code == 200, basis.text
    return {"claim_id": claim_id, "placements": placements, "basis": basis.json()}


def stage_initial_publication(ari: TestClient, key: str = "initial-publication"):
    return ari.post(
        f"/cases/{INITIAL_PUBLICATION_CASE_ID}/stage-review",
        json={
            "raw_request": "Issue the first editions of the authored reports.",
            "goal": domain.GOAL_CORRECT_FACTS,
            "disposition": domain.DISPOSITION_NO_CHANGE,
            "alternative_flag": False,
            "note": "",
            "idempotency_key": key,
        },
    )


# One read of what was authored: claims, occurrences, documents holding them,
# and decision basis edges. Relationship identities are counted, so a doubled
# edge is a different answer from a single one.
AUTHORED_COUNTS = """
MATCH (cl:Claim)
WITH count(cl) AS claims
OPTIONAL MATCH (occ:Occurrence)
WITH claims, count(occ) AS occurrences
OPTIONAL MATCH (:Occurrence)-[location:IN_DOCUMENT]->(doc:Document)
WITH claims, occurrences, count(DISTINCT doc) AS documents, count(location) AS locations
OPTIONAL MATCH (:Occurrence)-[instance:OF_CLAIM]->(:Claim)
WITH claims, occurrences, documents, locations, count(instance) AS instances
OPTIONAL MATCH (:Claim)-[binding:BASED_ON]->(:Comparison)
WITH claims, occurrences, documents, locations, instances, count(binding) AS bindings
OPTIONAL MATCH (:Decision)-[basis:BASED_ON]->(:Claim)
RETURN claims, occurrences, documents, locations, instances, bindings,
       count(basis) AS bases
"""


def authored_counts(graph) -> dict[str, int]:
    row = graph.run_one(AUTHORED_COUNTS)
    return {key: int(value) for key, value in row.items()}


class _CardParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.cards: list[dict[str, str]] = []
        self.decisions: list[dict[str, str]] = []
        self._card: dict[str, str] | None = None
        self._in_assertion = False

    def handle_starttag(self, tag, attrs):
        values = {key: value or "" for key, value in attrs}
        if values.get("data-block-kind") == "finding":
            self._card = dict(values, text="")
            self.cards.append(self._card)
        elif values.get("data-block-kind") == "decision":
            self.decisions.append(values)
        elif self._card is not None and values.get("class") == "card__assertion":
            self._in_assertion = True

    def handle_endtag(self, tag):
        if tag == "p":
            self._in_assertion = False
        elif tag == "section":
            self._card = None

    def handle_data(self, data):
        if self._in_assertion and self._card is not None:
            self._card["text"] += data


def parse_edition(body: str) -> dict[str, list[dict[str, str]]]:
    """Typed finding cards and decision blocks, parsed from the real bytes."""
    parser = _CardParser()
    parser.feed(body)
    return {"cards": parser.cards, "decisions": parser.decisions}
