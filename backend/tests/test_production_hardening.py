"""A deployment refuses unsafe configuration, ships Secure cookies, accepts
state changes only from its own origin, and never logs a secret.

Production behaviour is exercised two ways: by importing the application in a
real subprocess with `APP_ENV=production`, and by switching the live settings of
this process into production for one test, so the real middleware and the real
session code answer.
"""

from __future__ import annotations

import logging
import os
import secrets
import subprocess
import sys
from contextlib import contextmanager
from pathlib import Path
from typing import Iterator

import pytest
from fastapi.testclient import TestClient

from app import domain
from app.config import InsecureDeployment, Settings, enforce_deployment_safety, get_settings
from app.main import app
from tests.conftest import TEST_PASSCODES

BACKEND = Path(__file__).resolve().parent.parent
PUBLIC_ORIGIN = "https://rr.example.test"
FOREIGN_ORIGIN = "https://attacker.example.test"


def _import_app(env: dict[str, str]) -> subprocess.CompletedProcess[str]:
    """Import the application in a fresh interpreter, as uvicorn would."""
    child_env = {**os.environ, **env}
    return subprocess.run(
        [sys.executable, "-c", "import app.main"],
        cwd=BACKEND,
        env=child_env,
        capture_output=True,
        text=True,
        timeout=60,
    )


# -- startup refusals ---------------------------------------------------------


def test_production_refuses_to_start_without_a_session_secret() -> None:
    marker = "short-" + secrets.token_hex(4)
    started = _import_app(
        {
            "APP_ENV": "production",
            "SESSION_SECRET": marker,
            "DEMO_PASSCODES": "person-ari=" + secrets.token_urlsafe(12),
            "PUBLIC_ORIGIN": PUBLIC_ORIGIN,
        }
    )
    assert started.returncode != 0
    assert "InsecureDeployment" in started.stderr
    assert "SESSION_SECRET must be at least 32 characters" in started.stderr
    # The refusal names the problem, never the value.
    assert marker not in started.stderr + started.stdout


def test_production_refuses_to_start_without_demo_passcodes() -> None:
    secret = secrets.token_urlsafe(48)
    started = _import_app(
        {
            "APP_ENV": "production",
            "SESSION_SECRET": secret,
            "DEMO_PASSCODES": "",
            "PUBLIC_ORIGIN": PUBLIC_ORIGIN,
        }
    )
    assert started.returncode != 0
    assert "DEMO_PASSCODES must provision a credential" in started.stderr
    assert secret not in started.stderr + started.stdout


def test_production_starts_with_complete_configuration_and_logs_no_secret() -> None:
    secret = secrets.token_urlsafe(48)
    passcode = secrets.token_urlsafe(12)
    started = _import_app(
        {
            "APP_ENV": "production",
            "SESSION_SECRET": secret,
            "DEMO_PASSCODES": f"person-ari={passcode}",
            "PUBLIC_ORIGIN": PUBLIC_ORIGIN,
        }
    )
    assert started.returncode == 0, started.stderr
    output = started.stderr + started.stdout
    assert secret not in output
    assert passcode not in output


def test_a_deployment_refuses_a_missing_or_plain_http_public_origin() -> None:
    for origin in ("", "http://rr.example.test"):
        with pytest.raises(InsecureDeployment) as refused:
            enforce_deployment_safety(
                Settings(
                    app_env="production",
                    session_secret="s" * 48,
                    demo_passcodes="person-ari=a",
                    public_origin=origin,
                )
            )
        assert "PUBLIC_ORIGIN" in str(refused.value)


# -- production behaviour in this process -------------------------------------


@pytest.fixture()
def production(monkeypatch):
    """This process's live settings, switched to a deployment for one test."""
    settings = get_settings()
    monkeypatch.setattr(settings, "app_env", "production")
    monkeypatch.setattr(settings, "public_origin", PUBLIC_ORIGIN)
    monkeypatch.setattr(settings, "session_secret", secrets.token_urlsafe(48))
    return settings


@contextmanager
def site_client(origin: str | None = PUBLIC_ORIGIN) -> Iterator[TestClient]:
    """A browser on the deployed site: HTTPS, and its own Origin on every request."""
    headers = {"origin": origin} if origin else {}
    with TestClient(app, base_url=PUBLIC_ORIGIN, headers=headers) as http:
        yield http


def _sign_in(http: TestClient, person_id: str):
    return http.post(
        "/auth/demo-session",
        json={"person_id": person_id, "passcode": TEST_PASSCODES[person_id]},
    )


def _session_cookie_header(response) -> str:
    cookie = get_settings().session_cookie
    headers = [h for h in response.headers.get_list("set-cookie") if h.startswith(cookie + "=")]
    assert len(headers) == 1, response.headers.get_list("set-cookie")
    return headers[0]


def test_a_deployment_session_cookie_is_secure_httponly_and_samesite(
    seeded, production
) -> None:
    with site_client() as http:
        signed_in = _sign_in(http, domain.PERSON_ARI)
        assert signed_in.status_code == 200, signed_in.text
        header = _session_cookie_header(signed_in)
        attributes = [part.strip().lower() for part in header.split(";")]
        assert "secure" in attributes
        assert "httponly" in attributes
        assert "samesite=lax" in attributes

        signed_out = http.post("/auth/sign-out")
        cleared = [part.strip().lower() for part in _session_cookie_header(signed_out).split(";")]
        assert "secure" in cleared and "httponly" in cleared


def test_a_local_session_cookie_is_httponly_but_not_secure(seeded, client) -> None:
    signed_in = _sign_in(client, domain.PERSON_ARI)
    attributes = [part.strip().lower() for part in _session_cookie_header(signed_in).split(";")]
    assert "httponly" in attributes
    assert "samesite=lax" in attributes
    assert "secure" not in attributes


def test_a_deployment_accepts_state_changes_from_its_own_origin(seeded, production) -> None:
    with site_client() as http:
        assert _sign_in(http, domain.PERSON_ARI).status_code == 200
        state = http.get("/workspace").json()
        applied = http.post(
            f"/corrections/{domain.CASE_ID}/apply",
            json={
                "batch_ids": ["B09", "B10", "B11"],
                "expected_context_revision": state["context_revision"],
                "source_confirmed": True,
            },
        )
        assert applied.status_code == 200, applied.text


def test_a_deployment_refuses_a_foreign_origin_even_with_a_valid_session(
    seeded, production
) -> None:
    with site_client() as http:
        assert _sign_in(http, domain.PERSON_ARI).status_code == 200
        revision = http.get("/workspace").json()["context_revision"]
        refused = http.post(
            f"/corrections/{domain.CASE_ID}/apply",
            headers={"origin": FOREIGN_ORIGIN},
            json={
                "batch_ids": ["B09", "B10", "B11"],
                "expected_context_revision": revision,
                "source_confirmed": True,
            },
        )
        assert refused.status_code == 403
        assert refused.json()["code"] == "ORIGIN_REFUSED"
        # Nothing moved.
        assert http.get("/workspace").json()["context_revision"] == revision


def test_a_deployment_refuses_a_state_change_that_names_no_origin(seeded, production) -> None:
    with site_client(origin=None) as http:
        refused = _sign_in(http, domain.PERSON_ARI)
        assert refused.status_code == 403
        assert refused.json()["code"] == "ORIGIN_REQUIRED"
        assert "set-cookie" not in refused.headers


def test_a_deployment_falls_back_to_the_referer(seeded, production) -> None:
    with site_client(origin=None) as http:
        accepted = http.post(
            "/auth/demo-session",
            headers={"referer": f"{PUBLIC_ORIGIN}/workspace"},
            json={"person_id": domain.PERSON_ARI, "passcode": TEST_PASSCODES[domain.PERSON_ARI]},
        )
        assert accepted.status_code == 200, accepted.text
        refused = http.post(
            "/auth/sign-out", headers={"referer": f"{FOREIGN_ORIGIN}/page"}
        )
        assert refused.status_code == 403
        assert refused.json()["code"] == "ORIGIN_REFUSED"


def test_reads_need_no_origin_in_a_deployment(seeded, production) -> None:
    with site_client(origin=None) as http:
        assert http.get("/workspace").status_code == 200
        assert http.get("/health").status_code == 200


def test_locally_a_foreign_origin_is_still_refused(seeded, client) -> None:
    refused = client.post("/auth/sign-out", headers={"origin": FOREIGN_ORIGIN})
    assert refused.status_code == 403
    assert refused.json()["code"] == "ORIGIN_REFUSED"
    allowed = client.post("/auth/sign-out", headers={"origin": "http://localhost:5173"})
    assert allowed.status_code == 200


# -- logs ---------------------------------------------------------------------


def test_no_secret_reaches_the_logs(seeded, production, caplog) -> None:
    caplog.set_level(logging.DEBUG)
    tokens: list[str] = []
    with site_client() as http:
        for person_id in TEST_PASSCODES:
            signed_in = _sign_in(http, person_id)
            assert signed_in.status_code == 200
            tokens.append(http.cookies.get(production.session_cookie) or "")
            http.post("/auth/sign-out")
        wrong = http.post(
            "/auth/demo-session",
            json={"person_id": domain.PERSON_NOOR, "passcode": TEST_PASSCODES[domain.PERSON_ARI]},
        )
        assert wrong.status_code == 401
        assert _sign_in(http, domain.PERSON_OPERATOR).status_code == 200
        assert http.post("/demo/reset", json={"mode": "demo_setup"}).status_code == 200

    logged = caplog.text
    assert logged, "expected the run to log something to inspect"
    for value in [*TEST_PASSCODES.values(), production.session_secret, *filter(None, tokens)]:
        assert value not in logged
    if production.nvidia_api_key:
        assert production.nvidia_api_key not in logged
