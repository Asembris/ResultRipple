"""Issuing a session must require a server-side credential.

Naming an identity is not authenticating as one. Without this, anyone who could
reach the API could post `{"person_id": "person-noor"}` and hold the review
authority the whole product is built around.
"""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from app import domain
from app.config import DEV_SESSION_SECRET, InsecureDeployment, Settings, enforce_deployment_safety
from app.main import app
from tests import helpers
from tests.conftest import TEST_PASSCODES

# Every endpoint that changes authoritative state.
MUTATIONS = [
    ("POST", f"/corrections/{domain.CASE_ID}/apply",
     {"batch_ids": ["B09", "B10", "B11"], "expected_context_revision": 1, "source_confirmed": True}),
    ("POST", f"/cases/{domain.CASE_ID}/stage-review",
     {"raw_request": "x", "goal": domain.GOAL_CORRECT_FACTS,
      "disposition": domain.DISPOSITION_RETURN_FOR_REVIEW, "alternative_flag": False,
      "note": "", "focus_occurrence_ids": [], "idempotency_key": "anon"}),
    ("POST", f"/cases/{domain.CASE_ID}/refresh-review", None),
    ("POST", "/plans/any-plan/approve",
     {"plan_version": 1, "execution_fingerprint": "0" * 64, "acknowledged_alternative": True}),
    ("POST", "/plans/any-plan/reject", {"reason": "no"}),
    ("POST", "/plans/any-plan/release", {"operation_id": "anon"}),
    ("POST", "/demo/reviewer-assignment",
     {"from_person_id": domain.PERSON_NOOR, "to_person_id": domain.PERSON_SAM,
      "expected_context_revision": 1}),
]


# -- impersonation ------------------------------------------------------------


def test_a_session_cannot_be_issued_without_a_passcode(seeded, client: TestClient) -> None:
    response = client.post("/auth/demo-session", json={"person_id": domain.PERSON_NOOR})

    assert response.status_code == 422  # the passcode is not optional
    assert client.get("/auth/session").json()["actor"] is None


@pytest.mark.parametrize(
    "person_id",
    [domain.PERSON_ARI, domain.PERSON_NOOR, domain.PERSON_SAM, domain.PERSON_OPERATOR],
)
def test_a_wrong_passcode_refuses_every_demo_identity(
    seeded, client: TestClient, person_id: str
) -> None:
    response = client.post(
        "/auth/demo-session", json={"person_id": person_id, "passcode": "not-the-passcode"}
    )

    assert response.status_code == 401
    assert response.json()["code"] == "INVALID_DEMO_CREDENTIAL"
    assert client.get("/auth/session").json()["actor"] is None


def test_another_identity_passcode_does_not_authenticate_the_reviewer(
    seeded, client: TestClient
) -> None:
    """Holding Ari's credential must not make the caller Noor."""
    response = client.post(
        "/auth/demo-session",
        json={"person_id": domain.PERSON_NOOR, "passcode": TEST_PASSCODES[domain.PERSON_ARI]},
    )

    assert response.status_code == 401
    assert response.json()["code"] == "INVALID_DEMO_CREDENTIAL"


def test_an_unknown_identity_is_refused(seeded, client: TestClient) -> None:
    response = client.post(
        "/auth/demo-session", json={"person_id": "person-intruder", "passcode": "anything"}
    )

    assert response.status_code == 404
    assert response.json()["code"] == "UNKNOWN_IDENTITY"


def test_a_correct_passcode_still_resolves_capability_from_the_graph(
    seeded, client: TestClient
) -> None:
    response = client.post(
        "/auth/demo-session",
        json={"person_id": domain.PERSON_SAM, "passcode": TEST_PASSCODES[domain.PERSON_SAM]},
    )

    assert response.status_code == 200
    body = response.json()
    assert body["person_id"] == domain.PERSON_SAM
    assert body["demo_role"] == "reviewer"
    # Authenticating as Sam grants no approval authority on its own.
    assert helpers.workspace(client)["decision"]["current_reviewer_id"] == domain.PERSON_NOOR


@pytest.mark.parametrize(
    "cookie",
    [
        "person-noor",
        "eyJwZXJzb25faWQiOiJwZXJzb24tbm9vciJ9.fake.signature",
        "",
    ],
)
def test_a_forged_cookie_grants_nothing(seeded, client: TestClient, cookie: str) -> None:
    client.cookies.set("rr_session", cookie)

    refused = client.post(
        "/plans/any-plan/approve",
        json={
            "plan_version": 1,
            "execution_fingerprint": "0" * 64,
            "acknowledged_alternative": True,
        },
    )
    assert refused.status_code == 401
    # An unusable cookie is simply not a session; reading still works.
    assert client.get("/auth/session").json()["actor"] is None
    assert client.get("/workspace").status_code == 200


# -- observers are read-only --------------------------------------------------


@pytest.mark.parametrize("method,path,body", MUTATIONS, ids=[m[1] for m in MUTATIONS])
def test_an_observer_cannot_reach_any_mutation(
    seeded, client: TestClient, method: str, path: str, body
) -> None:
    response = client.request(method, path, json=body)
    assert response.status_code == 401


def test_an_observer_can_still_read_and_download(seeded, client: TestClient) -> None:
    assert client.get("/workspace").status_code == 200
    assert client.get(f"/comparisons/{domain.COMPARISON_ID}").status_code == 200
    edition = client.get(
        f"/editions/{seeded['version_one']['release_id']}/{domain.DOC_OPS}"
    )
    assert edition.status_code == 200
    assert "South costs $0.40 less per parcel than North." in edition.text


def test_signing_out_returns_to_observing(seeded, ari: TestClient) -> None:
    assert ari.get("/auth/session").json()["actor"]["person_id"] == domain.PERSON_ARI

    assert ari.post("/auth/sign-out").status_code == 200

    assert ari.get("/auth/session").json()["actor"] is None
    refused = ari.post(
        f"/corrections/{domain.CASE_ID}/apply",
        json={"batch_ids": ["B09"], "expected_context_revision": 1, "source_confirmed": True},
    )
    assert refused.status_code == 401


# -- deployment safety --------------------------------------------------------


def test_local_environments_may_use_development_defaults() -> None:
    for app_env in ("development", "test"):
        enforce_deployment_safety(
            Settings(app_env=app_env, session_secret=DEV_SESSION_SECRET, demo_passcodes="")
        )


def test_a_deployment_refuses_the_default_session_secret() -> None:
    with pytest.raises(InsecureDeployment) as refused:
        enforce_deployment_safety(
            Settings(
                app_env="production",
                session_secret=DEV_SESSION_SECRET,
                demo_passcodes="person-ari=x",
            )
        )
    assert "development placeholder" in str(refused.value)


def test_a_deployment_refuses_a_short_session_secret() -> None:
    with pytest.raises(InsecureDeployment):
        enforce_deployment_safety(
            Settings(app_env="production", session_secret="short", demo_passcodes="person-ari=x")
        )


def test_a_deployment_refuses_unprovisioned_passcodes() -> None:
    with pytest.raises(InsecureDeployment) as refused:
        enforce_deployment_safety(
            Settings(app_env="production", session_secret="s" * 48, demo_passcodes="   ")
        )
    assert "DEMO_PASSCODES" in str(refused.value)


def test_a_properly_configured_deployment_starts() -> None:
    enforce_deployment_safety(
        Settings(
            app_env="production",
            session_secret="s" * 48,
            demo_passcodes="person-ari=a,person-noor=b",
            public_origin="https://rr.example.test",
        )
    )


def test_no_passcode_is_served_to_the_browser(seeded, ari: TestClient) -> None:
    """The workspace read lists identities, never their credentials."""
    body = ari.get("/workspace").text
    for passcode in TEST_PASSCODES.values():
        assert passcode not in body
    assert "passcode" not in body.lower()
