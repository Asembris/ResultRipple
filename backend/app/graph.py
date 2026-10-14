"""The only module that talks to FalkorDB.

Queries are fixed and parameterized here; no caller supplies Cypher, labels, or
a graph name. Bootstrap needs exactly one query: a real connectivity probe.
"""

from __future__ import annotations

import time
from dataclasses import dataclass

from falkordb import FalkorDB
from redis.exceptions import RedisError

from .config import Settings
from .models import GraphStatus

# A trivial read that still exercises the module: parse, plan, execute, return.
_PROBE_QUERY = "RETURN $probe AS probe"
_PROBE_VALUE = "resultripple"


class GraphUnavailable(RuntimeError):
    """Raised when authoritative context cannot be reached or read."""

    def __init__(self, code: str, detail: str) -> None:
        super().__init__(detail)
        self.code = code
        self.detail = detail


@dataclass(frozen=True)
class GraphClient:
    """Thin wrapper over the official FalkorDB client."""

    settings: Settings

    @property
    def endpoint(self) -> str:
        return f"{self.settings.falkordb_host}:{self.settings.falkordb_port}"

    def _connect(self) -> FalkorDB:
        timeout = self.settings.falkordb_timeout_seconds
        return FalkorDB(
            host=self.settings.falkordb_host,
            port=self.settings.falkordb_port,
            socket_timeout=timeout,
            socket_connect_timeout=timeout,
        )

    def probe(self) -> GraphStatus:
        """Run one real query against the configured graph.

        Never raises: readiness reports a typed failure instead, so the frontend
        can show why graph-backed work is unavailable.
        """
        started = time.perf_counter()
        try:
            db = self._connect()
            server_version = str(db.connection.info("server").get("redis_version", ""))
            result = db.select_graph(self.settings.falkordb_graph).query(
                _PROBE_QUERY, {"probe": _PROBE_VALUE}
            )
        except RedisError as exc:
            return self._failure("GRAPH_UNREACHABLE", exc)
        except Exception as exc:  # the client wraps some driver errors itself
            return self._failure("GRAPH_QUERY_FAILED", exc)

        if not result.result_set or result.result_set[0][0] != _PROBE_VALUE:
            return GraphStatus(
                connected=False,
                graph=self.settings.falkordb_graph,
                endpoint=self.endpoint,
                error_code="GRAPH_QUERY_FAILED",
                error_detail="probe query returned an unexpected result set",
            )

        return GraphStatus(
            connected=True,
            graph=self.settings.falkordb_graph,
            endpoint=self.endpoint,
            latency_ms=round((time.perf_counter() - started) * 1000, 2),
            server_version=server_version or None,
        )

    def _failure(self, code: str, exc: Exception) -> GraphStatus:
        return GraphStatus(
            connected=False,
            graph=self.settings.falkordb_graph,
            endpoint=self.endpoint,
            error_code=code,  # type: ignore[arg-type]
            error_detail=f"{type(exc).__name__}: {exc}".strip(),
        )
