"""Readiness must reflect a real FalkorDB probe, in both directions."""

from dataclasses import dataclass

import pytest
from fastapi.testclient import TestClient

from app.config import Settings
from app.graph import GraphClient
from app.main import app, get_graph_client
from app.models import GraphStatus

CONNECTED = GraphStatus(
    connected=True,
    graph="resultripple",
    endpoint="127.0.0.1:6379",
    latency_ms=1.5,
    server_version="7.4.0",
)

UNREACHABLE = GraphStatus(
    connected=False,
    graph="resultripple",
    endpoint="127.0.0.1:6379",
    error_code="GRAPH_UNREACHABLE",
    error_detail="ConnectionError: connection refused",
)


@dataclass(frozen=True)
class StubGraphClient:
    status: GraphStatus

    def probe(self) -> GraphStatus:
        return self.status


@pytest.fixture()
def stub_graph(client: TestClient):
    def _use(status: GraphStatus) -> TestClient:
        app.dependency_overrides[get_graph_client] = lambda: StubGraphClient(status)
        return client

    yield _use
    app.dependency_overrides.clear()


def test_readiness_reports_a_connected_graph(stub_graph) -> None:
    response = stub_graph(CONNECTED).get("/ready")

    assert response.status_code == 200
    body = response.json()
    assert body["ready"] is True
    assert body["falkordb"]["connected"] is True
    assert body["falkordb"]["error_code"] is None


def test_readiness_fails_closed_when_the_graph_is_unreachable(stub_graph) -> None:
    response = stub_graph(UNREACHABLE).get("/ready")

    assert response.status_code == 503
    body = response.json()
    assert body["ready"] is False
    assert body["falkordb"]["error_code"] == "GRAPH_UNREACHABLE"


def test_probe_against_an_unused_port_reports_unreachable() -> None:
    """The probe itself must return a typed failure, not raise."""
    offline = GraphClient(
        settings=Settings(falkordb_port=6399, falkordb_timeout_seconds=0.5)
    )

    status = offline.probe()

    assert status.connected is False
    assert status.error_code in {"GRAPH_UNREACHABLE", "GRAPH_QUERY_FAILED"}
    assert status.latency_ms is None
