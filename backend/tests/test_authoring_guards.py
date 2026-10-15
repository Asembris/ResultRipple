"""Authoring refuses what it must, and a refusal or a retry writes nothing.

Every case asserts both the refusal and the unchanged graph: a refused write
that left an edge behind would be the failure, not the status code.
"""

from __future__ import annotations

import json

import pytest

from app import domain
from app.graph import GuardFailed

from . import helpers
from .conftest import session_for

NOTHING = {
    "claims": 0,
    "occurrences": 0,
    "documents": 0,
    "locations": 0,
    "instances": 0,
    "bindings": 0,
    "bases": 0,
}
COMPLETE = {
    "claims": 1,
    "occurrences": 2,
    "documents": 2,
    "locations": 2,
    "instances": 2,
    "bindings": 1,
    "bases": 1,
}


def _revision(http) -> int:
    return helpers.workspace(http)["context_revision"]


def _finding(ari) -> tuple[str, int]:
    created = helpers.create_finding(ari, _revision(ari))
    assert created.status_code == 200, created.text
    return created.json()["claim_id"], created.json()["context_revision"]


def _code(response) -> str:
    return response.json()["code"]


# -- who may author -------------------------------------------------------------


def test_observer_cannot_author(fresh, client):
    revision = _revision(client)
    responses = [
        helpers.create_finding(client, revision),
        helpers.insert_linked_finding(client, domain.DOC_OPS, "claim-x", "DOLLARS", revision),
        helpers.record_basis(client, "claim-x", revision),
    ]
    assert [r.status_code for r in responses] == [401, 401, 401]
    assert helpers.authored_counts(fresh["graph"]) == NOTHING
    assert _revision(client) == revision


@pytest.mark.parametrize("person_id", [domain.PERSON_NOOR, domain.PERSON_SAM, domain.PERSON_OPERATOR])
def test_reviewers_and_operator_cannot_author(fresh, fresh_ari, person_id):
    claim_id, revision = _finding(fresh_ari)
    with session_for(person_id) as other:
        responses = [
            helpers.create_finding(other, revision),
            helpers.insert_linked_finding(other, domain.DOC_MEMO, claim_id, "CENTS", revision),
            helpers.record_basis(other, claim_id, revision),
        ]
    assert [r.status_code for r in responses] == [403, 403, 403]
    assert {_code(r) for r in responses} == {"NOT_AUTHORIZED"}
    counts = helpers.authored_counts(fresh["graph"])
    assert (counts["claims"], counts["occurrences"], counts["bases"]) == (1, 0, 0)
    assert _revision(fresh_ari) == revision


# -- what may be authored -------------------------------------------------------


def test_unknown_targets_are_refused(fresh, fresh_ari):
    revision = _revision(fresh_ari)
    unknown_comparison = helpers.create_finding(
        fresh_ari, revision, comparison_id="cmp-does-not-exist"
    )
    assert unknown_comparison.status_code == 404
    assert _code(unknown_comparison) == "COMPARISON_UNKNOWN"

    unknown_claim = helpers.insert_linked_finding(
        fresh_ari, domain.DOC_OPS, "claim-does-not-exist", "DOLLARS", revision
    )
    assert unknown_claim.status_code == 404
    assert _code(unknown_claim) == "FINDING_UNKNOWN"

    claim_id, revision = _finding(fresh_ari)
    unknown_document = helpers.insert_linked_finding(
        fresh_ari, "doc-does-not-exist", claim_id, "DOLLARS", revision
    )
    assert unknown_document.status_code == 404
    assert _code(unknown_document) == "DOCUMENT_UNKNOWN"

    unknown_decision = helpers.record_basis(
        fresh_ari, claim_id, revision, decision_id="dec-does-not-exist"
    )
    assert unknown_decision.status_code == 404
    assert _code(unknown_decision) == "DECISION_UNKNOWN"
    counts = helpers.authored_counts(fresh["graph"])
    assert (counts["claims"], counts["occurrences"], counts["bases"]) == (1, 0, 0)


def test_unconfirmed_bindings_are_refused(fresh, fresh_ari):
    revision = _revision(fresh_ari)
    unconfirmed = helpers.create_finding(fresh_ari, revision, confirmed=False)
    assert unconfirmed.status_code == 400
    assert _code(unconfirmed) == "BINDING_NOT_CONFIRMED"
    assert helpers.authored_counts(fresh["graph"]) == NOTHING

    claim_id, revision = _finding(fresh_ari)
    for document_id, style in ((domain.DOC_OPS, "DOLLARS"), (domain.DOC_MEMO, "CENTS")):
        placed = helpers.insert_linked_finding(fresh_ari, document_id, claim_id, style, revision)
        revision = placed.json()["context_revision"]
    unconfirmed_basis = helpers.record_basis(fresh_ari, claim_id, revision, confirmed=False)
    assert unconfirmed_basis.status_code == 400
    assert _code(unconfirmed_basis) == "BASIS_NOT_CONFIRMED"
    assert helpers.authored_counts(fresh["graph"])["bases"] == 0
    assert _revision(fresh_ari) == revision


@pytest.mark.parametrize(
    ("document_id", "style"),
    [
        (domain.DOC_OPS, "CENTS"),
        (domain.DOC_MEMO, "DOLLARS"),
        (domain.DOC_OPS, "EUROS"),
        (domain.DOC_MEMO, "cents"),
    ],
)
def test_unsupported_card_style_is_refused(fresh, fresh_ari, document_id, style):
    claim_id, revision = _finding(fresh_ari)
    refused = helpers.insert_linked_finding(fresh_ari, document_id, claim_id, style, revision)
    assert refused.status_code == 422
    assert _code(refused) == "CARD_STYLE_NOT_ALLOWED"
    assert helpers.authored_counts(fresh["graph"])["occurrences"] == 0
    assert fresh["graph"].document(document_id)["source_revision"] == 1


def test_basis_requires_the_finding_beside_the_decision(fresh, fresh_ari):
    claim_id, revision = _finding(fresh_ari)
    early = helpers.record_basis(fresh_ari, claim_id, revision)
    assert early.status_code == 409
    assert _code(early) == "BASIS_REQUIRES_LINKED_FINDING"

    # Placed in the operations report only: still not beside the decision block.
    placed = helpers.insert_linked_finding(fresh_ari, domain.DOC_OPS, claim_id, "DOLLARS", revision)
    revision = placed.json()["context_revision"]
    still_early = helpers.record_basis(fresh_ari, claim_id, revision)
    assert still_early.status_code == 409
    assert _code(still_early) == "BASIS_REQUIRES_LINKED_FINDING"
    assert helpers.authored_counts(fresh["graph"])["bases"] == 0


# -- what the analyst saw -------------------------------------------------------


def test_stale_revision_is_refused_and_writes_nothing(fresh, fresh_ari):
    graph = fresh["graph"]
    stale = _revision(fresh_ari) - 1 if _revision(fresh_ari) > 1 else 0
    refused = helpers.create_finding(fresh_ari, stale)
    assert refused.status_code == 409
    assert _code(refused) == "STALE_REVISION"
    assert refused.json()["context"]["current_context_revision"] == _revision(fresh_ari)
    assert helpers.authored_counts(graph) == NOTHING

    claim_id, revision = _finding(fresh_ari)
    refused = helpers.insert_linked_finding(
        fresh_ari, domain.DOC_OPS, claim_id, "DOLLARS", revision - 1
    )
    assert refused.status_code == 409
    assert _code(refused) == "STALE_REVISION"
    assert helpers.authored_counts(graph)["occurrences"] == 0
    assert graph.document(domain.DOC_OPS)["source_revision"] == 1

    for document_id, style in ((domain.DOC_OPS, "DOLLARS"), (domain.DOC_MEMO, "CENTS")):
        placed = helpers.insert_linked_finding(fresh_ari, document_id, claim_id, style, revision)
        revision = placed.json()["context_revision"]
    refused = helpers.record_basis(fresh_ari, claim_id, revision - 1)
    assert refused.status_code == 409
    assert _code(refused) == "STALE_REVISION"
    assert helpers.authored_counts(graph)["bases"] == 0
    assert _revision(fresh_ari) == revision


# -- retries and duplicates -----------------------------------------------------


def test_retried_authoring_creates_no_double_edges(fresh, fresh_ari):
    graph = fresh["graph"]
    authored = helpers.author_everything(fresh_ari)
    claim_id = authored["claim_id"]
    revision = _revision(fresh_ari)
    sources = {
        doc_id: graph.document(doc_id) for doc_id in (domain.DOC_OPS, domain.DOC_MEMO)
    }

    # The same three requests again, once with the original stale revisions and
    # once with the current one. Every answer is the existing record.
    for attempt_revision in (1, revision):
        again = helpers.create_finding(fresh_ari, attempt_revision)
        assert again.status_code == 200 and again.json()["reused"] is True
        assert again.json()["claim_id"] == claim_id
        for placement in authored["placements"]:
            retried = helpers.insert_linked_finding(
                fresh_ari,
                placement["document_id"],
                claim_id,
                placement["card_style"],
                attempt_revision,
            )
            assert retried.status_code == 200 and retried.json()["reused"] is True
            assert retried.json()["occurrence_id"] == placement["occurrence_id"]
        basis = helpers.record_basis(fresh_ari, claim_id, attempt_revision)
        assert basis.status_code == 200 and basis.json()["reused"] is True

    assert helpers.authored_counts(graph) == COMPLETE
    assert _revision(fresh_ari) == revision
    for doc_id, before in sources.items():
        after = graph.document(doc_id)
        assert after == before
        blocks = json.loads(after["source_blocks"])
        assert [b["id"] for b in blocks if b["kind"] == "finding"] == [f"finding-{claim_id}"]


def test_guarded_writes_refuse_duplicates_on_their_own(fresh, fresh_ari):
    """The Cypher guards hold even if the service's pre-checks were bypassed."""
    graph = fresh["graph"]
    authored = helpers.author_everything(fresh_ari)
    claim_id = authored["claim_id"]
    revision = _revision(fresh_ari)
    ops = graph.document(domain.DOC_OPS)

    with pytest.raises(GuardFailed):
        graph.create_finding(
            workspace_id=domain.WORKSPACE_ID,
            comparison_id=domain.COMPARISON_ID,
            claim_id="claim-second-binding",
            title="duplicate",
            actor_id=domain.PERSON_ARI,
            expected_revision=revision,
            approved_at="2026-10-15T00:00:00+00:00",
            statement=domain.FINDING_APPROVAL_STATEMENT,
            witness="{}",
        )
    with pytest.raises(GuardFailed):
        graph.create_occurrence(
            workspace_id=domain.WORKSPACE_ID,
            document_id=domain.DOC_OPS,
            claim_id=claim_id,
            occurrence_id="occ-second-placement",
            card_style="DOLLARS",
            block_id="finding-second",
            source_blocks=ops["source_blocks"],
            source_sha=ops["source_sha"],
            expected_source_revision=int(ops["source_revision"]),
            expected_source_sha=ops["source_sha"],
            expected_revision=revision,
            actor_id=domain.PERSON_ARI,
            registered_at="2026-10-15T00:00:00+00:00",
        )
    with pytest.raises(GuardFailed):
        graph.record_decision_basis(
            workspace_id=domain.WORKSPACE_ID,
            decision_id=domain.DECISION_ID,
            claim_id=claim_id,
            decision_document_id=domain.DOC_MEMO,
            expected_revision=revision,
            actor_id=domain.PERSON_ARI,
            recorded_at="2026-10-15T00:00:00+00:00",
            statement="duplicate",
        )
    assert helpers.authored_counts(graph) == COMPLETE
    assert _revision(fresh_ari) == revision


def test_duplicated_claim_link_holds(fresh, fresh_ari):
    graph = fresh["graph"]
    authored = helpers.author_everything(fresh_ari)
    occurrence_id = authored["placements"][0]["occurrence_id"]
    # An out-of-band duplicate edge, as a corrupted or hand-edited graph would have.
    graph.run(
        "MATCH (o:Occurrence {id:$o}), (c:Claim {id:$c}) CREATE (o)-[:OF_CLAIM]->(c)",
        {"o": occurrence_id, "c": authored["claim_id"]},
    )
    state = helpers.workspace(fresh_ari)
    assert state["hold"]["code"] == "DUPLICATE_PROVENANCE"
    staged = helpers.stage_initial_publication(fresh_ari)
    assert staged.status_code == 409
    assert _code(staged) == "DUPLICATE_PROVENANCE"


# -- a missing source block -----------------------------------------------------


def test_missing_source_block_blocks_staging(fresh, fresh_ari):
    graph = fresh["graph"]
    helpers.author_everything(fresh_ari)
    _drop_finding_blocks(graph, domain.DOC_MEMO)

    staged = helpers.stage_initial_publication(fresh_ari)
    assert staged.status_code == 409
    assert _code(staged) == "SCOPE_INVENTORY_MISMATCH"
    assert helpers.workspace(fresh_ari)["current_release"] is None


def test_missing_source_block_after_approval_blocks_release(fresh, fresh_ari, fresh_noor):
    graph = fresh["graph"]
    helpers.author_everything(fresh_ari)
    plan = helpers.stage_initial_publication(fresh_ari).json()
    approved = helpers.approve(fresh_noor, plan, acknowledged=False)
    assert approved.status_code == 200, approved.text

    _drop_finding_blocks(graph, domain.DOC_OPS)

    issued = helpers.release(fresh_noor, plan["plan_id"], "after-block-removed")
    assert issued.status_code == 409
    assert _code(issued) == "SCOPE_INVENTORY_MISMATCH"
    state = helpers.workspace(fresh_ari)
    assert state["current_release"] is None
    assert state["releases"] == []
    assert {row["decision_status"] for row in graph.decision_authority(domain.DECISION_ID)} == {
        "PROPOSED"
    }


def test_missing_occurrence_blocks_staging(fresh, fresh_ari):
    graph = fresh["graph"]
    authored = helpers.author_everything(fresh_ari)
    memo = next(p for p in authored["placements"] if p["document_id"] == domain.DOC_MEMO)
    graph.run("MATCH (o:Occurrence {id:$o}) DETACH DELETE o", {"o": memo["occurrence_id"]})

    staged = helpers.stage_initial_publication(fresh_ari)
    assert staged.status_code == 409
    assert _code(staged) == "SCOPE_INVENTORY_MISMATCH"
    assert helpers.workspace(fresh_ari)["current_release"] is None


def _drop_finding_blocks(graph, document_id: str) -> None:
    """Simulate an out-of-band source edit that loses the authored card block."""
    document = graph.document(document_id)
    blocks = [b for b in json.loads(document["source_blocks"]) if b["kind"] != "finding"]
    graph.run(
        "MATCH (d:Document {id:$d}) SET d.source_blocks = $blocks, d.source_sha = $sha",
        {"d": document_id, "blocks": domain.canonical_json(blocks), "sha": domain.canonical_sha(blocks)},
    )
