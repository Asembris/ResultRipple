"""The operator reset reseeds through the ordinary seed functions, only for the
operator, and never over work in flight."""

from __future__ import annotations

import hashlib
import threading

import pytest
from fastapi.testclient import TestClient

from app import domain
from app.deps import get_artifact_store
from app.graph import WORKSPACE_LOCK
from tests import helpers
from tests.conftest import session_for


def _reset(http: TestClient, mode: str):
    return http.post("/demo/reset", json={"mode": mode})


# -- authorization ------------------------------------------------------------


def test_an_observer_cannot_reset(seeded, client: TestClient) -> None:
    refused = _reset(client, "demo_setup")
    assert refused.status_code == 401
    assert refused.json()["code"] == "NO_SESSION"


@pytest.mark.parametrize("person_id", [domain.PERSON_ARI, domain.PERSON_NOOR, domain.PERSON_SAM])
def test_only_the_operator_may_reset(seeded, person_id: str) -> None:
    before = seeded["graph"].run_one("MATCH (n) RETURN count(n) AS nodes")["nodes"]
    with session_for(person_id) as http:
        refused = _reset(http, "authoring_start")
    assert refused.status_code == 403
    assert refused.json()["code"] == "NOT_AUTHORIZED"
    after = seeded["graph"].run_one("MATCH (n) RETURN count(n) AS nodes")["nodes"]
    assert after == before


def test_an_unknown_mode_is_rejected(operator: TestClient) -> None:
    assert _reset(operator, "everything").status_code == 422
    assert operator.post("/demo/reset", json={}).status_code == 422


# -- modes --------------------------------------------------------------------


def test_demo_setup_issues_a_real_version_one(seeded, operator: TestClient) -> None:
    # Move the workspace on first, so the reset has something to undo.
    with session_for(domain.PERSON_ARI) as ari:
        helpers.apply_correction(ari)
    old_release = seeded["version_one"]["release_id"]

    response = _reset(operator, "demo_setup")
    assert response.status_code == 200, response.text
    receipt = response.json()

    assert receipt["mode"] == "demo_setup"
    assert receipt["operator_id"] == domain.PERSON_OPERATOR
    assert receipt["node_count"] > 0
    release = receipt["release"]
    assert release["sequence"] == 1
    assert sorted(release["edition_sha256"]) == sorted([domain.DOC_OPS, domain.DOC_MEMO])

    state = helpers.workspace(operator)
    assert state["current_release"]["release_id"] == release["release_id"]
    assert state["current_release"]["sequence"] == 1
    case = next(c for c in state["cases"] if c["source_ref"] == "DX-2026-0914")
    assert case["status"] == "CORRECTION_PENDING"

    # The receipt's hashes are the hashes of the bytes actually served.
    for document_id, sha in release["edition_sha256"].items():
        served = operator.get(f"/editions/{release['release_id']}/{document_id}")
        assert served.status_code == 200
        assert hashlib.sha256(served.content).hexdigest() == sha

    # The same seed gives the same Version 1 bytes, so the old release id is
    # reused, but nothing else from before the reset survives on the volume.
    store = get_artifact_store()
    assert [p.name for p in store.releases.iterdir()] == [release["release_id"]]
    assert len(list(store.candidates.iterdir())) == 1  # the setup plan's own candidates
    assert old_release == release["release_id"]


def test_authoring_start_leaves_nothing_registered(seeded, operator: TestClient) -> None:
    response = _reset(operator, "authoring_start")
    assert response.status_code == 200, response.text
    receipt = response.json()
    assert receipt["mode"] == "authoring_start"
    assert receipt["release"] is None

    state = helpers.workspace(operator)
    assert state["findings"] == []
    assert state["current_release"] is None
    assert "INITIAL-PUBLICATION" in {c["source_ref"] for c in state["cases"]}

    store = get_artifact_store()
    assert list(store.releases.iterdir()) == []
    assert list(store.candidates.iterdir()) == []

    # The old Version 1 is gone with the graph that recorded it.
    old = seeded["version_one"]
    assert operator.get(f"/editions/{old['release_id']}/{domain.DOC_OPS}").status_code == 404


def test_the_operator_session_survives_its_own_reset(seeded, operator: TestClient) -> None:
    assert _reset(operator, "authoring_start").status_code == 200
    assert _reset(operator, "demo_setup").status_code == 200
    assert operator.get("/auth/session").json()["actor"]["person_id"] == domain.PERSON_OPERATOR


# -- never over work in flight ------------------------------------------------


def test_a_reset_refuses_while_another_write_holds_the_workspace(
    seeded, operator: TestClient
) -> None:
    held = threading.Event()
    release = threading.Event()

    def hold() -> None:
        with WORKSPACE_LOCK:
            held.set()
            release.wait(timeout=30)

    holder = threading.Thread(target=hold)
    holder.start()
    try:
        assert held.wait(timeout=5)
        refused = _reset(operator, "demo_setup")
    finally:
        release.set()
        holder.join()
    assert refused.status_code == 409
    assert refused.json()["code"] == "WORKSPACE_BUSY"
    assert helpers.workspace(operator)["current_release"]["release_id"] == (
        seeded["version_one"]["release_id"]
    )


def test_a_reset_refuses_while_an_agent_run_is_unfinished(
    seeded, operator: TestClient
) -> None:
    seeded["graph"].create_agent_job(
        case_id=domain.CASE_ID,
        job={
            "job_id": "job-reset-guard",
            "status": "INVESTIGATING",
            "request_text": "in flight",
            "requested_by": domain.PERSON_ARI,
            "model": "test",
            "endpoint": "test",
            "reasoning": False,
            "started_at": "2026-10-15T00:00:00+00:00",
            "events": "[]",
            "usage": "{}",
        },
    )
    refused = _reset(operator, "authoring_start")
    assert refused.status_code == 409
    body = refused.json()
    assert body["code"] == "AGENT_RUN_IN_FLIGHT"
    assert body["context"]["job_ids"] == ["job-reset-guard"]
    assert helpers.workspace(operator)["findings"] != []
