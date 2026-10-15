"""ResultRipple API: evidence-connected publishing over FalkorDB."""

from __future__ import annotations

from typing import Annotated

import anyio
from fastapi import Depends, FastAPI, HTTPException, Response, status
from fastapi.middleware.cors import CORSMiddleware

from .config import enforce_deployment_safety, get_settings
from .deps import get_graph_client
from .graph import GraphClient
from .models import HealthResponse, ReadinessResponse
from .routes import refusal_handler, router

API_VERSION = "0.2.0"

IMPLEMENTED_SCOPE = [
    "health",
    "readiness",
    "authenticated-demo-sessions",
    "workspace",
    "evidence-correction",
    "deterministic-staging",
    "human-approval",
    "independent-verification",
    "immutable-editions",
]

settings = get_settings()

# A deployment carrying development defaults must not serve traffic at all.
enforce_deployment_safety(settings)

app = FastAPI(
    title="ResultRipple API",
    version=API_VERSION,
    summary="Evidence-connected publishing over FalkorDB (Track 3 - Company Brain).",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=list(settings.cors_origins),
    allow_credentials=True,
    allow_methods=["GET", "POST"],
    allow_headers=["content-type"],
)

app.add_exception_handler(HTTPException, refusal_handler)  # type: ignore[arg-type]
app.include_router(router)


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
