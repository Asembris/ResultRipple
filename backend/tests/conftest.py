"""Test configuration.

Integration tests run against a real FalkorDB on an isolated graph and an
isolated artifact volume. Nothing here mocks the graph: an answer that only a
stub could produce is not evidence that the product works.
"""

from __future__ import annotations

import os
import secrets
import tempfile
from contextlib import contextmanager
from pathlib import Path
from typing import Iterator

# The application reads configuration once, at import time, so the isolated
# graph and artifact volume must be in the environment before `app` is loaded.
_ARTIFACT_ROOT = Path(tempfile.gettempdir()) / "resultripple-tests" / "artifacts"
os.environ.setdefault("FALKORDB_GRAPH", "rr_test")
os.environ.setdefault("ARTIFACT_ROOT", str(_ARTIFACT_ROOT))
os.environ.setdefault("APP_ENV", "test")

# Credentials for this test run, generated per session so no passcode value is
# ever written into the repository. Locally the API generates throwaway ones and
# logs them; a deployment must provision real ones through the environment.
TEST_PASSCODES = {
    person_id: secrets.token_urlsafe(12)
    for person_id in ("person-ari", "person-noor", "person-sam", "person-operator")
}
os.environ.setdefault(
    "DEMO_PASSCODES", ",".join(f"{k}={v}" for k, v in TEST_PASSCODES.items())
)

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from app import domain  # noqa: E402
from app.config import get_settings  # noqa: E402
from app.deps import get_artifact_store, get_dataset_path, get_graph_client  # noqa: E402
from app.main import app  # noqa: E402
from scripts import seed_demo  # noqa: E402

from . import helpers  # noqa: E402


@contextmanager
def _client() -> Iterator[TestClient]:
    """One client, one event loop, for every request a test makes.

    A `TestClient` used outside its context manager runs each request in its own
    short-lived portal and tears the event loop down when that request finishes.
    The agent-run route starts its job with `asyncio.create_task`, and a task
    that has not yet reached its first await is destroyed with that loop --
    permanently, so no polling budget can recover it. Holding the context open
    keeps one loop alive across the requests of a test, which is how the real
    server runs anyway.
    """
    with TestClient(app) as http:
        yield http


@pytest.fixture()
def client() -> Iterator[TestClient]:
    with _client() as http:
        yield http


@pytest.fixture(scope="session")
def live_graph():
    graph = get_graph_client()
    probe = graph.probe()
    if not probe.connected:
        helpers.no_usable_graph(
            f"FalkorDB unavailable at {probe.endpoint}: {probe.error_detail}"
        )
    if get_settings().falkordb_graph == "resultripple":
        helpers.no_usable_graph("refusing to run destructive tests against the demo graph")
    return graph


@pytest.fixture()
def seeded(live_graph):
    """A freshly seeded workspace with a genuine Version 1 release."""
    store = get_artifact_store()
    csv_path = get_dataset_path()
    seed_demo.reset(live_graph)
    seed_demo.seed(live_graph, csv_path)
    issued = seed_demo.issue_version_one(live_graph, store, csv_path)
    return {
        "graph": live_graph,
        "store": store,
        "csv_path": csv_path,
        "version_one": issued["release"],
    }


@pytest.fixture()
def fresh(live_graph):
    """An authoring-start workspace: no claim, occurrence, basis or edition yet."""
    store = get_artifact_store()
    csv_path = get_dataset_path()
    seed_demo.reset(live_graph)
    seed_demo.seed_fresh(live_graph, csv_path)
    return {"graph": live_graph, "store": store, "csv_path": csv_path}


@contextmanager
def session_for(person_id: str) -> Iterator[TestClient]:
    """An authenticated demo client. Capability still comes from the graph."""
    with _client() as http:
        response = http.post(
            "/auth/demo-session",
            json={"person_id": person_id, "passcode": TEST_PASSCODES[person_id]},
        )
        assert response.status_code == 200, response.text
        yield http


@pytest.fixture()
def ari(seeded) -> Iterator[TestClient]:
    with session_for(domain.PERSON_ARI) as http:
        yield http


@pytest.fixture()
def noor(seeded) -> Iterator[TestClient]:
    with session_for(domain.PERSON_NOOR) as http:
        yield http


@pytest.fixture()
def sam(seeded) -> Iterator[TestClient]:
    with session_for(domain.PERSON_SAM) as http:
        yield http


@pytest.fixture()
def operator(seeded) -> Iterator[TestClient]:
    with session_for(domain.PERSON_OPERATOR) as http:
        yield http


@pytest.fixture()
def fresh_ari(fresh) -> Iterator[TestClient]:
    with session_for(domain.PERSON_ARI) as http:
        yield http


@pytest.fixture()
def fresh_noor(fresh) -> Iterator[TestClient]:
    with session_for(domain.PERSON_NOOR) as http:
        yield http


@pytest.fixture()
def placeholder_model_credential(monkeypatch):
    """Make the model look configured without configuring one.

    The scripted agent suites supply their own completions, so they need the
    admission gate open but no credential. A real key is left alone, and this
    stays a fixture rather than an environment default so the real-inference
    module in `test_agent_live.py` still evaluates `model_configured` at import
    time and skips honestly when no key is set.
    """
    settings = get_settings()
    if not settings.model_configured:
        monkeypatch.setattr(settings, "nvidia_api_key", "placeholder-not-a-real-key")
    return settings
