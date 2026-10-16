"""Negative guards. No unsafe release may pass any of these.

Each test breaks one real relationship or permission in the live graph and
checks that the product holds or blocks, rather than reusing a stale supported
statement or quietly narrowing its scope.
"""

from __future__ import annotations

import json

import pytest
from fastapi.testclient import TestClient

from app import domain
from app.config import Settings
from app.deps import get_graph_client
from app.graph import GraphClient
from app.main import app
from tests import helpers


def _state_unchanged(ari: TestClient, seeded) -> None:
    """No new current package and no committed proposal disposition.

    The decision status is read straight from the graph, because a held
    workspace view deliberately reports no comparison or decision at all.
    """
    state = helpers.workspace(ari)
    assert state["current_release"]["release_id"] == seeded["version_one"]["release_id"]
    status = seeded["graph"].run(
        "MATCH (d:Decision {id:$id}) RETURN d.status AS status", {"id": domain.DECISION_ID}
    )
    assert status[0]["status"] == "PROPOSED"


# -- provenance ---------------------------------------------------------------


def test_a_missing_finding_binding_holds_the_package(seeded, ari: TestClient) -> None:
    helpers.apply_correction(ari)
    seeded["graph"].run(
        "MATCH (:Occurrence {id:$occ})-[e:OF_CLAIM]->(:Claim) DELETE e",
        {"occ": domain.OCC_MEMO},
    )

    state = helpers.workspace(ari)
    assert state["hold"]["code"] == "MISSING_PROVENANCE"

    refused = helpers.stage(ari, key="missing-binding")
    assert refused.status_code == 409
    assert refused.json()["code"] == "MISSING_PROVENANCE"
    _state_unchanged(ari, seeded)


def test_a_duplicate_occurrence_location_holds_the_package(seeded, ari: TestClient) -> None:
    helpers.apply_correction(ari)
    seeded["graph"].run(
        """
        MATCH (occ:Occurrence {id:$occ}) MATCH (doc:Document {id:$doc})
        CREATE (occ)-[:IN_DOCUMENT]->(doc)
        """,
        {"occ": domain.OCC_OPS, "doc": domain.DOC_OPS},
    )

    refused = helpers.stage(ari, key="duplicate-location")
    assert refused.status_code == 409
    assert refused.json()["code"] == "DUPLICATE_PROVENANCE"
    _state_unchanged(ari, seeded)


def test_a_duplicate_comparison_binding_holds_the_package(seeded, ari: TestClient) -> None:
    helpers.apply_correction(ari)
    seeded["graph"].run(
        """
        MATCH (cl:Claim {id:$claim}) MATCH (cmp:Comparison {id:$cmp})
        CREATE (cl)-[:BASED_ON]->(cmp)
        """,
        {"claim": domain.CLAIM_ID, "cmp": domain.COMPARISON_ID},
    )

    refused = helpers.stage(ari, key="duplicate-binding")
    assert refused.status_code == 409
    assert refused.json()["code"] == "DUPLICATE_PROVENANCE"


def test_a_missing_comparison_side_holds_the_comparison(seeded, ari: TestClient) -> None:
    seeded["graph"].run("MATCH (:Comparison)-[e:RIGHT_SIDE]->(:Lane) DELETE e")

    state = helpers.workspace(ari)
    assert state["hold"]["code"] == "MISSING_COMPARISON_SIDE"
    assert state["comparison"] is None


def test_a_duplicate_lane_assignment_holds_the_evidence(seeded, ari: TestClient) -> None:
    seeded["graph"].run(
        """
        MATCH (b:Batch {id:'B05'}) MATCH (lane:Lane {id:$lane})
        CREATE (b)-[:ASSIGNED_TO]->(lane)
        """,
        {"lane": domain.LANE_PILOT},
    )

    state = helpers.workspace(ari)
    assert state["hold"]["code"] == "DUPLICATE_ASSIGNMENT"


def test_a_missing_lane_assignment_holds_the_evidence(seeded, ari: TestClient) -> None:
    seeded["graph"].run("MATCH (:Batch {id:'B01'})-[e:ASSIGNED_TO]->(:Lane) DELETE e")

    state = helpers.workspace(ari)
    assert state["hold"]["code"] == "MISSING_ASSIGNMENT"


def test_a_tampered_measurement_disagrees_with_the_raw_file(seeded, ari: TestClient) -> None:
    """The graph is authoritative for memberships, never for the measurements."""
    seeded["graph"].run("MATCH (b:Batch {id:'B05'}) SET b.cost_cents = 999")

    state = helpers.workspace(ari)
    assert state["hold"]["code"] == "MEASUREMENT_MISMATCH"


def test_an_authored_block_without_a_registered_occurrence_blocks(
    seeded, ari: TestClient
) -> None:
    """A caller cannot leave a finding block unregistered and still publish."""
    helpers.apply_correction(ari)
    seeded["graph"].run(
        "MATCH (occ:Occurrence {id:$occ}) SET occ.block_id = 'ops-finding-elsewhere'",
        {"occ": domain.OCC_OPS},
    )

    refused = helpers.stage(ari, key="block-mismatch")
    assert refused.status_code == 409
    assert refused.json()["code"] == "SCOPE_INVENTORY_MISMATCH"


# -- authority ----------------------------------------------------------------


def test_no_current_reviewer_holds_the_case(seeded, ari: TestClient) -> None:
    helpers.apply_correction(ari)
    seeded["graph"].run("MATCH (:Team)-[e:REVIEWED_BY]->(:Person) DELETE e")

    refused = helpers.stage(ari, key="no-reviewer")
    assert refused.status_code == 409
    assert refused.json()["code"] == "NO_REVIEWER"
    _state_unchanged(ari, seeded)


def test_two_current_reviewers_hold_the_case(seeded, ari: TestClient) -> None:
    helpers.apply_correction(ari)
    seeded["graph"].run(
        "MATCH (team:Team) MATCH (p:Person {id:$sam}) CREATE (team)-[:REVIEWED_BY]->(p)",
        {"sam": domain.PERSON_SAM},
    )

    refused = helpers.stage(ari, key="two-reviewers")
    assert refused.status_code == 409
    assert refused.json()["code"] == "AMBIGUOUS_REVIEWER"


def test_an_unauthenticated_request_cannot_mutate(seeded, client: TestClient) -> None:
    response = client.post(
        f"/corrections/{domain.CASE_ID}/apply",
        json={
            "batch_ids": ["B09", "B10", "B11"],
            "expected_context_revision": 1,
            "source_confirmed": True,
        },
    )
    assert response.status_code == 401


def test_a_request_body_cannot_name_the_actor(seeded, ari: TestClient, noor) -> None:
    """Identity comes from the signed session, never from the payload."""
    helpers.apply_correction(ari)
    plan = helpers.staged_plan(ari)

    forged = ari.post(
        f"/plans/{plan['plan_id']}/approve",
        json={
            "plan_version": plan["version"],
            "execution_fingerprint": plan["execution_fingerprint"],
            "acknowledged_alternative": True,
            "person_id": domain.PERSON_NOOR,
            "actor": domain.PERSON_NOOR,
            "demo_role": "reviewer",
        },
    )
    assert forged.status_code == 403
    assert forged.json()["code"] == "NOT_AUTHORIZED"


def test_only_the_operator_can_change_the_reviewer_assignment(
    seeded, ari, noor, sam, operator
) -> None:
    revision = helpers.workspace(ari)["context_revision"]
    for actor in (ari, noor, sam):
        refused = helpers.reassign(actor, revision)
        assert refused.status_code == 403
        assert refused.json()["code"] == "NOT_AUTHORIZED"

    accepted = helpers.reassign(operator, revision)
    assert accepted.status_code == 200
    assert accepted.json()["current_reviewer_id"] == domain.PERSON_SAM
    assert helpers.workspace(ari)["decision"]["current_reviewer_id"] == domain.PERSON_SAM


def test_a_changed_authority_refuses_the_old_approval(
    seeded, ari, noor, sam, operator
) -> None:
    """Noor approves validly; the rota changes; Noor's issue must be refused."""
    helpers.apply_correction(ari)
    plan = helpers.staged_plan(ari)
    assert helpers.approve(noor, plan).status_code == 200

    revision = helpers.workspace(ari)["context_revision"]
    assert helpers.reassign(operator, revision).status_code == 200

    refused = helpers.release(noor, plan["plan_id"])
    assert refused.status_code == 409
    body = refused.json()
    assert body["code"] == "AUTHORITY_CHANGED"
    assert body["context"]["approved_reviewer_id"] == domain.PERSON_NOOR
    assert body["context"]["current_reviewer_id"] == domain.PERSON_SAM

    # No new current release and no committed proposal disposition.
    _state_unchanged(ari, seeded)

    # Sam cannot simply issue Noor's approved plan either.
    refused_sam = helpers.release(sam, plan["plan_id"])
    assert refused_sam.status_code == 409
    assert refused_sam.json()["code"] == "AUTHORITY_CHANGED"
    _state_unchanged(ari, seeded)


def test_refresh_routes_the_same_candidates_to_the_new_reviewer(
    seeded, ari, noor, sam, operator
) -> None:
    helpers.apply_correction(ari)
    plan = helpers.staged_plan(ari)
    helpers.approve(noor, plan)
    helpers.reassign(operator, helpers.workspace(ari)["context_revision"])
    helpers.release(noor, plan["plan_id"])

    refreshed = ari.post(f"/cases/{domain.CASE_ID}/refresh-review")
    assert refreshed.status_code == 200, refreshed.text
    new_plan = refreshed.json()

    # Identical content and candidate bytes; a new permission fingerprint.
    assert new_plan["version"] == plan["version"] + 1
    assert new_plan["content_hash"] == plan["content_hash"]
    assert json.loads(new_plan["candidates"]) == json.loads(plan["candidates"])
    assert new_plan["execution_fingerprint"] != plan["execution_fingerprint"]
    assert new_plan["assigned_reviewer_id"] == domain.PERSON_SAM
    assert new_plan["refresh"]["model_calls"] == 0

    # Noor's prior approval survives only as invalid history.
    stale = ari.get(f"/plans/{plan['plan_id']}").json()
    assert stale["status"] in {"STALE_AUTHORITY", "SUPERSEDED"}
    assert stale["invalidation_reason"] == "AUTHORITY_CHANGED"

    # Noor cannot approve the refreshed plan; Sam can, and can then issue it.
    assert helpers.approve(noor, new_plan).status_code == 403
    assert helpers.approve(sam, new_plan).status_code == 200
    issued = helpers.release(sam, new_plan["plan_id"], operation_id="op-refresh")
    assert issued.status_code == 200, issued.text

    state = helpers.workspace(ari)
    assert state["current_release"]["release_id"] == issued.json()["release"]["release_id"]
    assert state["decision"]["status"] == "RETURNED_FOR_REVIEW"


def test_refresh_is_refused_when_a_content_premise_also_changed(
    seeded, ari, noor, operator
) -> None:
    helpers.apply_correction(ari)
    plan = helpers.staged_plan(ari)
    helpers.approve(noor, plan)
    helpers.reassign(operator, helpers.workspace(ari)["context_revision"])

    # Evidence moved as well, so the reviewer-only shortcut must not apply.
    seeded["graph"].run(
        """
        MATCH (b:Batch {id:'B09'})-[a:ASSIGNED_TO]->(:Lane)
        MATCH (south:Lane {id:$south})
        DELETE a
        CREATE (b)-[:ASSIGNED_TO]->(south)
        """,
        {"south": domain.LANE_SOUTH},
    )

    refused = ari.post(f"/cases/{domain.CASE_ID}/refresh-review")
    assert refused.status_code == 409
    assert refused.json()["code"] == "NEW_INVESTIGATION_REQUIRED"
    _state_unchanged(ari, seeded)


def test_refresh_without_an_authority_change_is_refused(seeded, ari, noor) -> None:
    helpers.apply_correction(ari)
    plan = helpers.staged_plan(ari)
    helpers.approve(noor, plan)

    refused = ari.post(f"/cases/{domain.CASE_ID}/refresh-review")
    assert refused.status_code == 409
    assert refused.json()["code"] == "NO_AUTHORITY_CHANGE"


# -- graph dependence ---------------------------------------------------------


def test_without_falkordb_there_is_no_new_impact_answer(seeded, ari: TestClient) -> None:
    """Existing editions stay readable; new graph-backed answers stop."""
    offline = GraphClient(settings=Settings(falkordb_port=6399, falkordb_timeout_seconds=0.5))
    app.dependency_overrides[get_graph_client] = lambda: offline
    try:
        response = TestClient(app).get("/workspace")
        assert response.status_code == 503
        assert response.json()["code"] in {"GRAPH_UNREACHABLE", "GRAPH_QUERY_FAILED"}
    finally:
        app.dependency_overrides.clear()


@pytest.mark.parametrize("path", ["../../etc/passwd", "..%2Fsecret"])
def test_an_edition_path_cannot_come_from_the_request(seeded, ari: TestClient, path) -> None:
    response = ari.get(f"/editions/{seeded['version_one']['release_id']}/{path}")
    assert response.status_code in {404, 409}


def test_the_rota_change_refuses_a_team_with_two_review_edges(seeded, ari, operator) -> None:
    """Audit C C3b: a second edge is a hold, not something to add a third beside."""
    graph = seeded["graph"]
    graph.run(
        """
        MATCH (team:Team {id:$team}), (sam:Person {id:$sam})
        CREATE (team)-[:REVIEWED_BY]->(sam)
        """,
        {"team": domain.TEAM_ID, "sam": domain.PERSON_SAM},
    )
    count = "MATCH (:Team)-[a:REVIEWED_BY]->() RETURN count(a) AS n"
    before = graph.run(count)[0]["n"]

    refused = helpers.reassign(operator, helpers.workspace(ari)["context_revision"])

    assert refused.status_code == 409
    assert refused.json()["code"] == "REASSIGN_GUARD_FAILED"
    assert graph.run(count)[0]["n"] == before


def test_the_rota_change_acts_on_the_team_that_owns_the_decision(seeded, ari, operator) -> None:
    """Audit C U4: authority follows the decision's owner, never a constant team."""
    graph = seeded["graph"]
    graph.run(
        """
        MATCH (d:Decision {id:$decision})-[o:OWNED_BY]->(:Team), (sam:Person {id:$sam})
        DELETE o
        CREATE (t:Team {id:'team-expansion-board', name:'Expansion Board'})
        CREATE (d)-[:OWNED_BY]->(t)
        CREATE (t)-[:REVIEWED_BY]->(sam)
        """,
        {"decision": domain.DECISION_ID, "sam": domain.PERSON_SAM},
    )
    revision = helpers.workspace(ari)["context_revision"]

    # Noor reviews the old team, which no longer owns the decision: no write.
    refused = helpers.reassign(operator, revision)
    assert refused.status_code == 409
    assert refused.json()["code"] == "REASSIGN_GUARD_FAILED"

    moved = operator.post(
        "/demo/reviewer-assignment",
        json={
            "from_person_id": domain.PERSON_SAM,
            "to_person_id": domain.PERSON_NOOR,
            "expected_context_revision": revision,
        },
    )
    assert moved.status_code == 200, moved.text
    assert moved.json()["previous_reviewer_id"] == domain.PERSON_SAM
    decision = helpers.workspace(ari)["decision"]
    assert decision["team_id"] == "team-expansion-board"
    assert decision["current_reviewer_id"] == domain.PERSON_NOOR
