"""ResultRipple API: evidence-connected publishing over FalkorDB."""

from __future__ import annotations

import logging
from contextlib import asynccontextmanager
from typing import Annotated

import anyio
from fastapi import Depends, FastAPI, HTTPException, Response, status
from fastapi.middleware.cors import CORSMiddleware

from . import jobs
from .config import enforce_deployment_safety, get_settings
from .deps import get_graph_client
from .graph import GraphClient, GraphUnavailable
from .models import AgentStatus, HealthResponse, ReadinessResponse
from .routes import refusal_handler, router

API_VERSION = "0.3.0"

logger = logging.getLogger("resultripple.startup")

IMPLEMENTED_SCOPE = [
    "health",
    "readiness",
    "authenticated-demo-sessions",
    "workspace",
    "evidence-correction",
    "deterministic-staging",
    "nvidia-agent-runs",
    "human-approval",
    "independent-verification",
    "immutable-editions",
]

settings = get_settings()

# A deployment carrying development defaults must not serve traffic at all.
enforce_deployment_safety(settings)


@asynccontextmanager
async def lifespan(_: FastAPI):
    """Startup integrity: no unfinished run may look completed after a restart."""
    try:
        interrupted = await anyio.to_thread.run_sync(
            jobs.interrupt_unfinished, get_graph_client()
        )
        if interrupted:
            logger.warning("marked %s unfinished agent job(s) as interrupted", interrupted)
    except GraphUnavailable as exc:
        # The API still serves existing immutable editions and reports why new
        # graph-backed work is unavailable.
        logger.warning("could not audit agent jobs at startup: %s", exc.code)
    yield


app = FastAPI(
    title="ResultRipple API",
    version=API_VERSION,
    summary="Evidence-connected publishing over FalkorDB (Track 3 - Company Brain).",
    lifespan=lifespan,
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
        agent=AgentStatus(
            # Whether a credential exists, never the credential.
            configured=settings.model_configured,
            model=settings.nvidia_model,
            endpoint=settings.nvidia_api_base_url,
            reasoning=settings.nvidia_reasoning,
            max_model_turns=settings.agent_max_model_turns,
            max_tool_calls=settings.agent_max_tool_calls,
            max_completion_tokens=settings.agent_max_completion_tokens,
            deadline_seconds=settings.agent_deadline_seconds,
        ),
        implemented_scope=IMPLEMENTED_SCOPE,
    )
