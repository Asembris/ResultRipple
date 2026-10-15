"""Shared steps for the integration tests. Real endpoint calls only."""

from __future__ import annotations

from typing import Any

from fastapi.testclient import TestClient

from app import domain

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
