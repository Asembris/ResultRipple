"""A legitimate change after approval must leave the case recoverable.

Each sequence here used to strand the case: the release was refused, which is
safe, but stage, refresh, reject and re-approve were all refused too and only
the operator reset recovered it. A stale or unverifiable plan is now retired
with its reason and the case reopens, so the analyst can restage a new version
and the reviewer approves it afresh. Approval is never carried over.
"""

from __future__ import annotations

from fastapi.testclient import TestClient

from app import domain, service
from app.verify_artifacts import VerificationReport

from . import helpers


def _case(http: TestClient, case_id: str = domain.CASE_ID) -> dict:
    return next(c for c in helpers.workspace(http)["cases"] if c["case_id"] == case_id)


def _assert_retired(http: TestClient, plan_id: str, reason: str, case_id: str) -> None:
    retired = http.get(f"/plans/{plan_id}").json()
    assert retired["status"] == "INVALIDATED"
    assert retired["invalidation_reason"] == reason
    assert _case(http, case_id)["status"] == "NEEDS_CHANGES"


def _restage_approve_issue(analyst, reviewer, *, key: str, stage_kwargs=None) -> dict:
    """The ordinary recovery path: a new version, a fresh approval, one release."""
    plan = helpers.staged_plan(analyst, key=key, **(stage_kwargs or {}))
    approved = helpers.approve(reviewer, plan, acknowledged=bool(plan["alternative_flag"]))
    assert approved.status_code == 200, approved.text
    issued = helpers.release(reviewer, plan["plan_id"], f"op-{key}")
    assert issued.status_code == 200, issued.text
    return {"plan": plan, "release": issued.json()["release"]}


def _move_b09_back_to_south(graph) -> None:
    """An upstream writer moves one batch after approval (Audit C U1)."""
    graph.run(
        """
        MATCH (b:Batch {id:'B09'})-[a:ASSIGNED_TO]->(:Lane), (south:Lane {id:$south})
        DELETE a
        CREATE (b)-[:ASSIGNED_TO]->(south)
        """,
        {"south": domain.LANE_SOUTH},
    )


def test_u1_an_upstream_move_after_approval_reopens_the_case(seeded, ari, noor):
    helpers.apply_correction(ari)
    plan = helpers.staged_plan(ari)
    assert helpers.approve(noor, plan).status_code == 200
    _move_b09_back_to_south(seeded["graph"])

    refused = helpers.release(noor, plan["plan_id"], "op-u1")
    assert refused.status_code == 409
    body = refused.json()
    assert body["code"] == "STALE_PLAN"
    assert body["context"]["plan_invalidated"] is True
    _assert_retired(ari, plan["plan_id"], "STALE_PLAN", domain.CASE_ID)

    # The old approval is history: it can be neither approved nor released again.
    assert helpers.approve(noor, plan).json()["code"] == "PLAN_STATE"
    assert helpers.release(noor, plan["plan_id"], "op-u1-again").json()["code"] == (
        "PLAN_INVALIDATED"
    )

    recovered = _restage_approve_issue(ari, noor, key="u1-restage")
    assert recovered["plan"]["version"] == plan["version"] + 1
    state = helpers.workspace(ari)
    assert state["current_release"]["release_id"] == recovered["release"]["release_id"]
    assert state["comparison"]["relation"] == domain.RELATION_EQUAL


def test_u7_authoring_after_approval_reopens_the_initial_publication(
    fresh, fresh_ari, fresh_noor
):
    """Audit C U7, adapted: the one-card package must now carry its basis."""
    state = helpers.workspace(fresh_ari)
    finding = helpers.create_finding(fresh_ari, state["context_revision"]).json()
    placed = helpers.insert_linked_finding(
        fresh_ari, domain.DOC_MEMO, finding["claim_id"], "CENTS", finding["context_revision"]
    ).json()
    basis = helpers.record_basis(fresh_ari, finding["claim_id"], placed["context_revision"])
    assert basis.status_code == 200, basis.text

    plan = helpers.stage_initial_publication(fresh_ari).json()
    assert helpers.approve(fresh_noor, plan, acknowledged=False).status_code == 200

    # The analyst keeps authoring: the finding now also goes in the ops report.
    later = helpers.insert_linked_finding(
        fresh_ari,
        domain.DOC_OPS,
        finding["claim_id"],
        "DOLLARS",
        basis.json()["context_revision"],
    )
    assert later.status_code == 200, later.text

    refused = helpers.release(fresh_noor, plan["plan_id"], "op-u7")
    assert refused.status_code == 409
    assert refused.json()["code"] == "STALE_PLAN"
    case_id = helpers.INITIAL_PUBLICATION_CASE_ID
    _assert_retired(fresh_ari, plan["plan_id"], "STALE_PLAN", case_id)

    restaged = helpers.stage_initial_publication(fresh_ari, key="u7-restage")
    assert restaged.status_code == 200, restaged.text
    second = restaged.json()
    assert len(second["covered_occurrence_ids"]) == 2
    assert helpers.approve(fresh_noor, second, acknowledged=False).status_code == 200
    issued = helpers.release(fresh_noor, second["plan_id"], "op-u7-restage")
    assert issued.status_code == 200, issued.text
    assert issued.json()["verification"]["ok"] is True


def test_u8_a_rota_round_trip_after_approval_reopens_the_case(seeded, ari, noor, operator):
    helpers.apply_correction(ari)
    plan = helpers.staged_plan(ari)
    assert helpers.approve(noor, plan).status_code == 200

    revision = helpers.workspace(ari)["context_revision"]
    assert helpers.reassign(operator, revision).status_code == 200
    back = operator.post(
        "/demo/reviewer-assignment",
        json={
            "from_person_id": domain.PERSON_SAM,
            "to_person_id": domain.PERSON_NOOR,
            "expected_context_revision": revision + 1,
        },
    )
    assert back.status_code == 200, back.text

    refused = helpers.release(noor, plan["plan_id"], "op-u8")
    assert refused.status_code == 409
    assert refused.json()["code"] == "STALE_CONTEXT"
    _assert_retired(ari, plan["plan_id"], "STALE_CONTEXT", domain.CASE_ID)

    # A retired plan is not refreshed; it is restaged.
    refresh = ari.post(f"/cases/{domain.CASE_ID}/refresh-review")
    assert refresh.json()["code"] == "NEW_INVESTIGATION_REQUIRED"

    recovered = _restage_approve_issue(ari, noor, key="u8-restage")
    assert helpers.workspace(ari)["current_release"]["release_id"] == (
        recovered["release"]["release_id"]
    )
    assert helpers.workspace(ari)["decision"]["status"] == "RETURNED_FOR_REVIEW"


def test_a_stale_plan_refused_at_approval_reopens_the_case(seeded, ari, noor):
    helpers.apply_correction(ari)
    plan = helpers.staged_plan(ari)
    _move_b09_back_to_south(seeded["graph"])

    refused = helpers.approve(noor, plan)
    assert refused.status_code == 409
    assert refused.json()["code"] == "STALE_PLAN"
    _assert_retired(ari, plan["plan_id"], "STALE_PLAN", domain.CASE_ID)
    _restage_approve_issue(ari, noor, key="approval-restage")


def test_a_verification_failure_reopens_the_case(seeded, ari, noor, monkeypatch):
    helpers.apply_correction(ari)
    plan = helpers.staged_plan(ari)
    assert helpers.approve(noor, plan).status_code == 200

    def failing(**_kwargs):
        report = VerificationReport()
        report.record("injected_disagreement", False, "test double")
        return report

    monkeypatch.setattr(service, "verify_package", failing)
    refused = helpers.release(noor, plan["plan_id"], "op-unverified")
    assert refused.status_code == 409
    assert refused.json()["code"] == "VERIFICATION_FAILED"
    _assert_retired(ari, plan["plan_id"], "VERIFICATION_FAILED", domain.CASE_ID)

    monkeypatch.undo()
    _restage_approve_issue(ari, noor, key="verified-restage")


def test_only_the_current_reviewer_can_retire_a_plan(seeded, ari, noor, sam):
    helpers.apply_correction(ari)
    plan = helpers.staged_plan(ari)
    assert helpers.approve(noor, plan).status_code == 200
    _move_b09_back_to_south(seeded["graph"])

    for http in (ari, sam):
        refused = helpers.release(http, plan["plan_id"], "op-not-mine")
        assert refused.status_code == 403
        assert refused.json()["code"] == "NOT_AUTHORIZED"

    assert ari.get(f"/plans/{plan['plan_id']}").json()["status"] == "APPROVED"
    assert _case(ari)["status"] == "APPROVED"
