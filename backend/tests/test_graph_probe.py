"""Live FalkorDB probe. Skipped when no graph is running, except in CI."""

import pytest

from app.config import get_settings
from app.graph import GraphClient

from . import helpers


@pytest.fixture(scope="module")
def probe():
    return GraphClient(settings=get_settings()).probe()


def test_probe_reaches_the_configured_graph(probe) -> None:
    if not probe.connected:
        helpers.no_usable_graph(
            f"FalkorDB unavailable at {probe.endpoint}: {probe.error_detail}"
        )

    assert probe.graph == get_settings().falkordb_graph
    assert probe.latency_ms is not None
    assert probe.server_version
