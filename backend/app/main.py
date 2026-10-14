"""ResultRipple API — bootstrap surface: liveness and graph-backed readiness."""

from __future__ import annotations

from typing import Annotated

import anyio
from fastapi import Depends, FastAPI, Response, status
from fastapi.middleware.cors import CORSMiddleware

from .config import get_settings
from .graph import GraphClient
from .models import HealthResponse, ReadinessResponse

API_VERSION = "0.1.0"

# Bootstrap implements no domain workflow yet; readiness says so out loud rather
# than implying the correction case exists.
IMPLEMENTED_SCOPE = ["health", "readiness"]

settings = get_settings()
_graph_client = GraphClient(settings=settings)


def get_graph_client() -> GraphClient:
    """Injected so tests can substitute a probe without a live container."""
    return _graph_client

app = FastAPI(
    title="ResultRipple API",
    version=API_VERSION,
    summary="Evidence-connected publishing over FalkorDB (Track 3 — Company Brain).",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=list(settings.cors_origins),
    allow_credentials=True,
    allow_methods=["GET", "POST"],
    allow_headers=["content-type"],
)


@app.get("/health", response_model=HealthResponse, tags=["ops"])
def health() -> HealthResponse:
    """Liveness only. Deliberately touches no external dependency."""
    return HealthResponse(version=API_VERSION)


@app.get("/ready", response_model=ReadinessResponse, tags=["ops"])
async def ready(
    response: Response,
    graph: Annotated[GraphClient, Depends(get_graph_client)],
) -> ReadinessResponse:
    """Readiness, backed by a real FalkorDB query.

    The client is synchronous, so the probe runs in a worker thread to keep the
    event loop responsive when the graph is unreachable.
    """
    falkordb = await anyio.to_thread.run_sync(graph.probe)
    if not falkordb.connected:
        response.status_code = status.HTTP_503_SERVICE_UNAVAILABLE
    return ReadinessResponse(
        ready=falkordb.connected,
        version=API_VERSION,
        falkordb=falkordb,
        implemented_scope=IMPLEMENTED_SCOPE,
    )
