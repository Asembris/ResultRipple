"""The agent-run HTTP boundary: admission, job state, and startup integrity.

Inference is replaced here by a recorded execution so the contract is tested
deterministically. The decisive end-to-end evidence with real NVIDIA calls is in
`test_agent_live.py`.
"""

from __future__ import annotations

import threading
from typing import Any

import pytest

from app import domain, jobs, service
from app.config import get_settings
from app.deps import get_job_store
from app.jobs import AgentJobStore
from app.service import Actor, WorkflowRefused

from . import helpers

ARI = Actor("person-ari", "Ari Mensah", "analyst", False)
REQUEST = helpers.CORRECTION_REQUEST


class RecordedRuns:
    """What the replaced execution was asked, and when it finished.

    The replacement signals completion itself, so a test waits for the real
    event rather than for a polling budget to expire.
    """

    def __init__(self) -> None:
        self.calls: list[dict[str, Any]] = []
        self.finished = threading.Event()

    def await_execution(self, timeout: float = 15.0) -> None:
        assert self.finished.wait(timeout), (
            "the background run never executed: the route's task was never run"
        )


@pytest.fixture()
def recorded_execution(monkeypatch):
    """Replace inference with a recorded terminal outcome, written to the graph."""
    runs = RecordedRuns()

    def execute(self, graph, store, csv_path, **kwargs):  # noqa: ANN001
        runs.calls.append(kwargs)
        graph.update_agent_job(
            job_id=kwargs["job_id"],
            fields={
                "status": "AWAITING_REVIEW",
                "finished_at": "2026-10-15T00:00:00+00:00",
                "plan_id": "plan-recorded",
                "elapsed_ms": 1234,
                "tool_call_count": 2,
                "model_turn_count": 2,
                "events": '[{"kind":"model","turn":1}]',
                "usage": '{"total_tokens":7}',
            },
        )
        get_job_store()._release(kwargs["job_id"])
        # The graph is already terminal at this point, so a test that observes
        # this event can read the finished job without racing it.
        runs.finished.set()
        return {"job_id": kwargs["job_id"], "status": "AWAITING_REVIEW"}

    monkeypatch.setattr(AgentJobStore, "execute", execute)
    return runs


def _completed_job(http, runs: RecordedRuns, job_id: str) -> dict[str, Any]:
    """Read the job once the recorded run has actually finished it."""
    runs.await_execution()
    response = http.get(f"/jobs/{job_id}")
    assert response.status_code == 200, response.text
    job = response.json()
    assert job["terminal"], job
    return job


@pytest.fixture(autouse=True)
def _model_looks_configured(placeholder_model_credential):
    """Inference is scripted here, so the run only needs the gate open."""


# -- admission ----------------------------------------------------------------


def test_an_observer_cannot_start_an_agent_run(client, seeded):
    response = client.post(
        f"/cases/{domain.CASE_ID}/agent-runs", json={"request_text": REQUEST}
    )
    assert response.status_code == 401
    assert response.json()["code"] == "NO_SESSION"


def test_a_reviewer_cannot_start_an_agent_run(noor, seeded):
    response = noor.post(
        f"/cases/{domain.CASE_ID}/agent-runs", json={"request_text": REQUEST}
    )
    assert response.status_code == 403
    assert response.json()["code"] == "NOT_AUTHORIZED"


def test_a_run_needs_an_applied_correction(ari):
    response = ari.post(f"/cases/{domain.CASE_ID}/agent-runs", json={"request_text": REQUEST})
    assert response.status_code == 409
    assert response.json()["code"] == "CASE_STATE"


def test_an_empty_request_is_rejected(ari):
    helpers.apply_correction(ari)
    response = ari.post(f"/cases/{domain.CASE_ID}/agent-runs", json={"request_text": "   "})
    assert response.status_code == 400
    assert response.json()["code"] == "REQUEST_REQUIRED"


def test_an_over_long_request_is_rejected_by_the_dto(ari):
    helpers.apply_correction(ari)
    response = ari.post(
        f"/cases/{domain.CASE_ID}/agent-runs", json={"request_text": "x" * 2001}
    )
    assert response.status_code == 422


def test_a_run_is_accepted_persisted_and_then_reported(ari, seeded, recorded_execution):
    helpers.apply_correction(ari)
    response = ari.post(f"/cases/{domain.CASE_ID}/agent-runs", json={"request_text": REQUEST})
    assert response.status_code == 202, response.text
    accepted = response.json()
    assert accepted["status"] == "QUEUED"
    assert accepted["model"] == get_settings().nvidia_model
    assert accepted["request_text"] == REQUEST

    job = _completed_job(ari, recorded_execution, accepted["job_id"])
    assert job["status"] == "AWAITING_REVIEW"
    assert job["plan_id"] == "plan-recorded"
    assert job["case_id"] == domain.CASE_ID
    assert job["requested_by"] == domain.PERSON_ARI
    assert job["usage"] == {"total_tokens": 7}
    assert job["events"] == [{"kind": "model", "turn": 1}]
    # The run was handed the analyst's own words and nothing else.
    assert recorded_execution.calls[0]["request_text"] == REQUEST
    assert recorded_execution.calls[0]["actor"].person_id == domain.PERSON_ARI


def test_a_second_run_is_refused_while_one_is_in_flight(ari, seeded):
    helpers.apply_correction(ari)
    graph = seeded["graph"]
    graph.create_agent_job(
        case_id=domain.CASE_ID,
        job={
            "job_id": "job-inflight",
            "status": "INVESTIGATING",
            "request_text": REQUEST,
            "requested_by": domain.PERSON_ARI,
            "model": "m",
            "endpoint": "e",
            "reasoning": False,
            "started_at": "2026-10-15T00:00:00+00:00",
            "events": "[]",
            "usage": "{}",
        },
    )
    response = ari.post(f"/cases/{domain.CASE_ID}/agent-runs", json={"request_text": REQUEST})
    assert response.status_code == 409
    assert response.json()["code"] == "AGENT_RUN_IN_FLIGHT"
    assert response.json()["context"]["job_id"] == "job-inflight"


def test_an_unconfigured_model_refuses_the_run_without_pretending(seeded):
    store = AgentJobStore(get_settings().model_copy(update={"nvidia_api_key": ""}))
    with pytest.raises(WorkflowRefused) as refused:
        store.accept(
            seeded["graph"], actor=ARI, case_id=domain.CASE_ID, request_text=REQUEST
        )
    assert refused.value.code == "MODEL_NOT_CONFIGURED"
    assert refused.value.http_status == 503
    assert "manual correction workflow" in refused.value.detail
    assert seeded["graph"].agent_jobs_for_case(domain.CASE_ID) == []


def test_concurrent_jobs_are_bounded(seeded):
    settings = get_settings().model_copy(update={"agent_max_concurrent_jobs": 1})
    store = AgentJobStore(settings)
    graph = seeded["graph"]
    service.apply_correction(
        graph,
        actor=ARI,
        case_id=domain.CASE_ID,
        batch_ids=["B09", "B10", "B11"],
        expected_revision=int(graph.workspace(domain.WORKSPACE_ID)["context_revision"]),
    )
    first = store.accept(graph, actor=ARI, case_id=domain.CASE_ID, request_text=REQUEST)
    assert first["status"] == "QUEUED"
    # A different case, so the per-case guard is not what refuses this one.
    with pytest.raises(WorkflowRefused) as refused:
        store.accept(
            graph,
            actor=ARI,
            case_id="case-initial-publication",
            request_text=REQUEST,
        )
    assert refused.value.code in {"AGENT_BUSY", "CASE_STATE"}
    store._release(first["job_id"])


# -- reading jobs -------------------------------------------------------------


def test_an_unknown_job_is_a_typed_refusal(client, seeded):
    response = client.get("/jobs/job-does-not-exist")
    assert response.status_code == 404
    assert response.json()["code"] == "JOB_UNKNOWN"


def test_runs_are_listed_for_the_case_and_shown_in_the_workspace(ari, seeded, recorded_execution):
    helpers.apply_correction(ari)
    accepted = ari.post(
        f"/cases/{domain.CASE_ID}/agent-runs", json={"request_text": REQUEST}
    ).json()
    _completed_job(ari, recorded_execution, accepted["job_id"])

    listed = ari.get(f"/cases/{domain.CASE_ID}/agent-runs")
    assert listed.status_code == 200
    assert [run["job_id"] for run in listed.json()["runs"]] == [accepted["job_id"]]

    state = helpers.workspace(ari)
    case = next(c for c in state["cases"] if c["case_id"] == domain.CASE_ID)
    assert case["agent_runs"][0]["status"] == "AWAITING_REVIEW"


# -- startup integrity --------------------------------------------------------


def test_a_restart_marks_an_unfinished_run_interrupted(seeded):
    graph = seeded["graph"]
    graph.create_agent_job(
        case_id=domain.CASE_ID,
        job={
            "job_id": "job-crashed",
            "status": "STAGING",
            "request_text": REQUEST,
            "requested_by": domain.PERSON_ARI,
            "model": "m",
            "endpoint": "e",
            "reasoning": False,
            "started_at": "2026-10-15T00:00:00+00:00",
            "events": "[]",
            "usage": "{}",
        },
    )
    assert jobs.interrupt_unfinished(graph) == 1
    job = jobs.read_job(graph, "job-crashed")
    assert job["status"] == "INTERRUPTED"
    assert job["error_code"] == "INTERRUPTED"
    assert job["terminal"] is True
    # Running it again changes nothing: a terminal job is left alone.
    assert jobs.interrupt_unfinished(graph) == 0


# -- readiness ----------------------------------------------------------------


def test_readiness_reports_the_model_configuration_but_never_the_key(client, seeded):
    body = client.get("/ready").json()
    agent = body["agent"]
    assert agent["configured"] == get_settings().model_configured
    assert agent["model"] == get_settings().nvidia_model
    assert agent["endpoint"].startswith("https://")
    assert agent["max_model_turns"] == 4
    assert agent["max_tool_calls"] == 6
    assert agent["max_completion_tokens"] == 4096
    assert agent["deadline_seconds"] == 25.0
    assert "nvidia-agent-runs" in body["implemented_scope"]
    key = get_settings().nvidia_api_key
    assert not key or key not in client.get("/ready").text
