"""Guarded mutations must write everything or nothing.

A filter placed after a write is not a rollback. These tests drive the real
guarded queries against a real FalkorDB with a missing document or occurrence
and assert that the graph is byte-identical afterwards: no plan, no release, no
moved pointer, no committed decision, no bumped context revision.

Before the guards were reordered, the same calls returned a failure to the
caller while leaving a half-built plan behind -- and, worse, a release that was
already the current pointer with only one of its two documents attached.
"""

from __future__ import annotations

import json
from typing import Any

import pytest
from fastapi.testclient import TestClient

from app import domain
from app.graph import GraphClient, GuardFailed
from tests import helpers

MISSING_DOCUMENT = "doc-does-not-exist"
MISSING_OCCURRENCE = "occ-does-not-exist"


def snapshot(graph: GraphClient) -> dict[str, Any]:
    """Everything a half-finished write could disturb."""
    return {
        "plans": graph.run(
            "MATCH (p:ReviewPlan) RETURN p.id AS id, p.status AS status ORDER BY id"
        ),
        "plan_edges": graph.run(
            """
            MATCH (p:ReviewPlan)-[r]->(n)
            RETURN p.id AS plan, type(r) AS kind, n.id AS target
            ORDER BY plan, kind, target
            """
        ),
        "releases": graph.run(
            "MATCH (r:Release) RETURN r.id AS id, r.sequence AS sequence ORDER BY id"
        ),
        "included": graph.run(
            """
            MATCH (r:Release)-[:INCLUDES_DOCUMENT]->(doc:Document)
            RETURN r.id AS release, doc.id AS document ORDER BY release, document
            """
        ),
        "pointer": graph.run(
            "MATCH (:Workspace)-[:CURRENT_RELEASE]->(r:Release) RETURN r.id AS id"
        ),
        "decision": graph.run("MATCH (d:Decision) RETURN d.id AS id, d.status AS status"),
        "cases": graph.run(
            "MATCH (c:CorrectionCase) RETURN c.id AS id, c.status AS status ORDER BY id"
        ),
        "revision": graph.run("MATCH (w:Workspace) RETURN w.context_revision AS revision"),
        "assertions": graph.run(
            """
            MATCH (o:Occurrence)
            RETURN o.id AS id, o.original_assertion AS assertion ORDER BY id
            """
        ),
    }


def approved_plan(ari: TestClient, noor: TestClient) -> dict[str, Any]:
    helpers.apply_correction(ari)
    plan = helpers.staged_plan(ari)
    assert helpers.approve(noor, plan).status_code == 200
    return ari.get(f"/plans/{plan['plan_id']}").json()


def release_arguments(plan: dict[str, Any], context_revision: int) -> dict[str, Any]:
    scope = plan["scope"]
    return {
        "workspace_id": domain.WORKSPACE_ID,
        "plan_id": plan["plan_id"],
        "plan_version": int(plan["version"]),
        "fingerprint": plan["execution_fingerprint"],
        "expected_revision": context_revision,
        "expected_prior_release_id": plan["prior_release_id"] or "",
        "decision_id": domain.DECISION_ID,
        "basis_claim_id": scope["decision"]["basis_claim_id"],
        "decision_status": "RETURNED_FOR_REVIEW",
        "release": {
            "release_id": "rel-should-never-exist",
            "sequence": 99,
            "issued_at": "2026-10-15T00:00:00+00:00",
            "artifacts": "{}",
            "receipt": "{}",
            "occurrence_snapshots": "[]",
            "operation_id": "atomicity-probe",
        },
        "document_ids": [doc["document_id"] for doc in scope["documents"]],
        "occurrence_assertions": [
            [entry["occurrence_id"], json.dumps(entry["current"])]
            for entry in scope["assessment"]
        ],
    }


# -- create_plan --------------------------------------------------------------


def test_a_plan_missing_an_occurrence_is_never_created(seeded, ari: TestClient) -> None:
    graph = seeded["graph"]
    helpers.apply_correction(ari)
    before = snapshot(graph)

    with pytest.raises(GuardFailed) as refused:
        graph.create_plan(
            case_id=domain.CASE_ID,
            plan=_plan_properties("plan-atomicity-probe"),
            occurrence_ids=[domain.OCC_OPS, MISSING_OCCURRENCE],
            reviewer_id=domain.PERSON_NOOR,
        )

    assert refused.value.code == "PLAN_WRITE_FAILED"
    assert snapshot(graph) == before
    assert graph.plan("plan-atomicity-probe") is None
    # Not even the partially covered half of the scope survives.
    assert graph.run("MATCH (p:ReviewPlan {id:'plan-atomicity-probe'}) RETURN p.id AS id") == []


def test_a_clashing_plan_id_does_not_create_a_second_plan(seeded, ari: TestClient) -> None:
    graph = seeded["graph"]
    helpers.apply_correction(ari)
    plan = helpers.staged_plan(ari)
    before = snapshot(graph)

    with pytest.raises(GuardFailed):
        graph.create_plan(
            case_id=domain.CASE_ID,
            plan=_plan_properties(plan["plan_id"]),
            occurrence_ids=[domain.OCC_OPS, domain.OCC_MEMO],
            reviewer_id=domain.PERSON_NOOR,
        )

    assert snapshot(graph) == before
    assert len(graph.plans_for_case(domain.CASE_ID)) == 1


# -- commit_release -----------------------------------------------------------


def test_a_release_missing_a_document_is_never_committed(seeded, ari, noor) -> None:
    graph = seeded["graph"]
    plan = approved_plan(ari, noor)
    revision = helpers.workspace(ari)["context_revision"]
    before = snapshot(graph)

    arguments = release_arguments(plan, revision)
    arguments["document_ids"] = [domain.DOC_OPS, MISSING_DOCUMENT]

    with pytest.raises(GuardFailed) as refused:
        graph.commit_release(**arguments)

    assert refused.value.code == "RELEASE_GUARD_FAILED"
    assert snapshot(graph) == before

    # Nothing incomplete is current, and the proposal is still only proposed.
    state = helpers.workspace(ari)
    assert state["current_release"]["release_id"] == seeded["version_one"]["release_id"]
    assert sorted(state["current_release"]["document_ids"]) == sorted(
        [domain.DOC_OPS, domain.DOC_MEMO]
    )
    assert state["decision"]["status"] == "PROPOSED"
    assert state["context_revision"] == revision
    assert graph.release("rel-should-never-exist") is None


def test_a_release_missing_an_occurrence_is_never_committed(seeded, ari, noor) -> None:
    graph = seeded["graph"]
    plan = approved_plan(ari, noor)
    revision = helpers.workspace(ari)["context_revision"]
    before = snapshot(graph)

    arguments = release_arguments(plan, revision)
    arguments["occurrence_assertions"] = [
        [MISSING_OCCURRENCE, '{"text":"nowhere"}'],
        *arguments["occurrence_assertions"],
    ]

    with pytest.raises(GuardFailed):
        graph.commit_release(**arguments)

    assert snapshot(graph) == before
    assert graph.release("rel-should-never-exist") is None
    assert helpers.workspace(ari)["decision"]["status"] == "PROPOSED"


def test_a_decision_status_changes_only_through_its_recorded_basis(seeded, ari, noor) -> None:
    """Audit C U5: no BASED_ON path from the decision to a placed claim, no release."""
    graph = seeded["graph"]
    plan = approved_plan(ari, noor)
    revision = helpers.workspace(ari)["context_revision"]
    graph.run(
        "MATCH (:Decision {id:$decision})-[b:BASED_ON]->(:Claim) DELETE b",
        {"decision": domain.DECISION_ID},
    )
    before = snapshot(graph)

    with pytest.raises(GuardFailed) as refused:
        graph.commit_release(**release_arguments(plan, revision))

    assert refused.value.code == "RELEASE_GUARD_FAILED"
    assert snapshot(graph) == before
    assert graph.release("rel-should-never-exist") is None


def test_a_basis_claim_outside_the_released_scope_is_never_committed(
    seeded, ari, noor
) -> None:
    graph = seeded["graph"]
    plan = approved_plan(ari, noor)
    revision = helpers.workspace(ari)["context_revision"]
    before = snapshot(graph)

    arguments = release_arguments(plan, revision)
    arguments["basis_claim_id"] = "claim-not-in-scope"
    with pytest.raises(GuardFailed):
        graph.commit_release(**arguments)

    assert snapshot(graph) == before


def test_a_stale_revision_leaves_the_current_package_untouched(seeded, ari, noor) -> None:
    graph = seeded["graph"]
    plan = approved_plan(ari, noor)
    before = snapshot(graph)

    with pytest.raises(GuardFailed):
        graph.commit_release(**release_arguments(plan, context_revision := 999))

    assert context_revision == 999
    assert snapshot(graph) == before


def test_the_plan_stays_releasable_after_a_refused_commit(seeded, ari, noor) -> None:
    """A guard that wrote nothing must also have broken nothing."""
    graph = seeded["graph"]
    plan = approved_plan(ari, noor)
    revision = helpers.workspace(ari)["context_revision"]

    arguments = release_arguments(plan, revision)
    arguments["document_ids"] = [domain.DOC_OPS, MISSING_DOCUMENT]
    with pytest.raises(GuardFailed):
        graph.commit_release(**arguments)

    issued = helpers.release(noor, plan["plan_id"])
    assert issued.status_code == 200, issued.text
    released = issued.json()["release"]
    assert sorted(released["document_ids"]) == sorted([domain.DOC_OPS, domain.DOC_MEMO])
    assert helpers.workspace(ari)["decision"]["status"] == "RETURNED_FOR_REVIEW"


def _plan_properties(plan_id: str) -> dict[str, Any]:
    return {
        "plan_id": plan_id,
        "version": 99,
        "raw_request": "atomicity probe",
        "goal": domain.GOAL_CORRECT_FACTS,
        "alternative_flag": False,
        "disposition": domain.DISPOSITION_RETURN_FOR_REVIEW,
        "note": "",
        "content_hash": "0" * 64,
        "execution_fingerprint": "1" * 64,
        "candidates": "{}",
        "scope": "{}",
        "context_revision": 1,
        "prior_release_id": "",
        "staged_at": "2026-10-15T00:00:00+00:00",
        "idempotency_key": "atomicity-probe",
        "staged_by": domain.PERSON_ARI,
    }


# -- the current-release pointer ------------------------------------------------


def _parallel_pointer(graph, release_id: str) -> None:
    """Audit C C6: a second CURRENT_RELEASE edge to the same release."""
    graph.run(
        """
        MATCH (w:Workspace {id:$workspace}), (r:Release {id:$release})
        CREATE (w)-[:CURRENT_RELEASE]->(r)
        """,
        {"workspace": domain.WORKSPACE_ID, "release": release_id},
    )


def _second_current_release(graph) -> None:
    """Audit C C9: a pointer to a different release beside the real one."""
    graph.run(
        """
        MATCH (w:Workspace {id:$workspace})
        CREATE (r:Release {id:'rel-injected', sequence:7, issued_at:'2026-10-16T00:00:00+00:00',
                           artifacts:'{}', receipt:'{}', occurrence_snapshots:'[]',
                           operation_id:'injected'})
        CREATE (w)-[:CURRENT_RELEASE]->(r)
        """,
        {"workspace": domain.WORKSPACE_ID},
    )


@pytest.mark.parametrize("inject", ["parallel", "second_release"])
def test_more_than_one_current_pointer_holds_the_workspace(seeded, ari, noor, inject) -> None:
    graph = seeded["graph"]
    plan = approved_plan(ari, noor)
    if inject == "parallel":
        _parallel_pointer(graph, seeded["version_one"]["release_id"])
    else:
        _second_current_release(graph)

    state = helpers.workspace(ari)
    assert state["hold"]["code"] == "AMBIGUOUS_CURRENT_RELEASE"
    assert state["current_release"] is None

    before = snapshot(graph)
    refused = helpers.release(noor, plan["plan_id"], "op-ambiguous")
    assert refused.status_code == 409
    assert refused.json()["code"] == "AMBIGUOUS_CURRENT_RELEASE"
    assert snapshot(graph) == before


def test_commit_release_refuses_two_pointers_before_any_write(seeded, ari, noor) -> None:
    """The guarded write itself counts pointers; it never duplicates a release."""
    graph = seeded["graph"]
    plan = approved_plan(ari, noor)
    revision = helpers.workspace(ari)["context_revision"]
    _parallel_pointer(graph, seeded["version_one"]["release_id"])
    before = snapshot(graph)

    with pytest.raises(GuardFailed):
        graph.commit_release(**release_arguments(plan, revision))

    assert snapshot(graph) == before
    assert graph.run("MATCH (r:Release {id:'rel-should-never-exist'}) RETURN count(r) AS n")[0][
        "n"
    ] == 0
