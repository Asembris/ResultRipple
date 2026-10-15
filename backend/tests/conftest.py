"""Test configuration.

Integration tests run against a real FalkorDB on an isolated graph and an
isolated artifact volume. Nothing here mocks the graph: an answer that only a
stub could produce is not evidence that the product works.
"""

from __future__ import annotations

import os
import secrets
import tempfile
from pathlib import Path

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


@pytest.fixture()
def client() -> TestClient:
    return TestClient(app)


@pytest.fixture(scope="session")
def live_graph():
    graph = get_graph_client()
    probe = graph.probe()
    if not probe.connected:
        pytest.skip(f"FalkorDB unavailable at {probe.endpoint}: {probe.error_detail}")
    if get_settings().falkordb_graph == "resultripple":
        pytest.skip("refusing to run destructive tests against the demo graph")
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


def session_for(person_id: str) -> TestClient:
    """An authenticated demo client. Capability still comes from the graph."""
    http = TestClient(app)
    response = http.post(
        "/auth/demo-session",
        json={"person_id": person_id, "passcode": TEST_PASSCODES[person_id]},
    )
    assert response.status_code == 200, response.text
    return http


@pytest.fixture()
def ari(seeded) -> TestClient:
    return session_for(domain.PERSON_ARI)


@pytest.fixture()
def noor(seeded) -> TestClient:
    return session_for(domain.PERSON_NOOR)


@pytest.fixture()
def sam(seeded) -> TestClient:
    return session_for(domain.PERSON_SAM)


@pytest.fixture()
def operator(seeded) -> TestClient:
    return session_for(domain.PERSON_OPERATOR)
