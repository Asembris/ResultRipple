"""Typed response bodies for the bootstrap endpoints."""

from typing import Literal

from pydantic import BaseModel, Field


class HealthResponse(BaseModel):
    """Liveness: the API process answers. It says nothing about FalkorDB."""

    status: Literal["ok"] = "ok"
    service: str = "resultripple-api"
    version: str


class GraphStatus(BaseModel):
    """Outcome of one real FalkorDB round trip."""

    connected: bool
    graph: str
    endpoint: str
    # Populated only when `connected` is true.
    latency_ms: float | None = None
    server_version: str | None = None
    # Populated only when `connected` is false: a stable code plus a safe detail.
    error_code: Literal["GRAPH_UNREACHABLE", "GRAPH_QUERY_FAILED"] | None = None
    error_detail: str | None = None


class ReadinessResponse(BaseModel):
    """Readiness: the API can serve graph-backed work."""

    ready: bool
    service: str = "resultripple-api"
    version: str
    falkordb: GraphStatus
    # Bootstrap carries no domain schema yet; the UI shows this honestly.
    implemented_scope: list[str] = Field(default_factory=list)
