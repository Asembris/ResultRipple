"""Operator reset: reseed the demo workspace through the ordinary seed functions.

A reset is a guarded demo-operator control, like the reviewer rota change. It
never runs over work in flight: it refuses while another workspace write holds
the mutation lock (an edition issue among them) and while any agent run is
unfinished. Otherwise it clears the graph first, then the artifact volume, and
reseeds. `demo_setup` issues a real Version 1 through the same staging, approval
and release path the product uses; `authoring_start` leaves nothing registered.

The receipt reports what the graph and the volume now hold, read back after the
reseed rather than assumed.
"""

from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from . import domain, seed
from .agent import TERMINAL_STATES
from .artifacts import ArtifactStore
from .graph import WORKSPACE_LOCK, GraphClient
from .service import Actor, WorkflowRefused

MODE_DEMO_SETUP = "demo_setup"
MODE_AUTHORING_START = "authoring_start"
RESET_MODES = (MODE_DEMO_SETUP, MODE_AUTHORING_START)


def _now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def reset_workspace(
    graph: GraphClient,
    store: ArtifactStore,
    csv_path: Path,
    *,
    actor: Actor,
    mode: str,
    active_agent_jobs: int,
) -> dict[str, Any]:
    if actor.demo_role != "operator":
        raise WorkflowRefused(
            "NOT_AUTHORIZED",
            "a workspace reset needs the demo-operator capability",
            http_status=403,
        )
    if mode not in RESET_MODES:
        raise WorkflowRefused(
            "RESET_MODE_UNKNOWN",
            f"mode must be one of {', '.join(RESET_MODES)}",
            http_status=422,
        )

    # Every workspace write, issuing editions included, holds this lock for its
    # whole duration. A reset never waits behind one and then erases its result.
    if not WORKSPACE_LOCK.acquire(blocking=False):
        raise WorkflowRefused(
            "WORKSPACE_BUSY",
            "another workspace write, such as issuing editions, is in progress",
        )
    try:
        unfinished = graph.unfinished_agent_jobs(terminal_states=list(TERMINAL_STATES))
        if unfinished or active_agent_jobs:
            raise WorkflowRefused(
                "AGENT_RUN_IN_FLIGHT",
                "an agent run is unfinished; wait for it before resetting",
                context={
                    "job_ids": [row["job_id"] for row in unfinished],
                    "active_in_process": active_agent_jobs,
                },
            )

        started_at = _now()
        seed.reset(graph)
        store.clear()

        release: dict[str, Any] | None = None
        if mode == MODE_DEMO_SETUP:
            seed.seed(graph, csv_path)
            release = seed.issue_version_one(graph, store, csv_path)["release"]
        else:
            seed.seed_fresh(graph, csv_path)

        workspace = graph.run_one(
            "MATCH (w:Workspace {id:$id}) RETURN w.context_revision AS revision",
            {"id": domain.WORKSPACE_ID},
        )
        return {
            "mode": mode,
            "operator_id": actor.person_id,
            "graph": graph.graph_name,
            "node_count": seed.node_count(graph),
            "context_revision": int(workspace["revision"]) if workspace else None,
            "release": (
                {
                    "release_id": release["release_id"],
                    "sequence": int(release["sequence"]),
                    "issued_at": release["issued_at"],
                    "edition_sha256": {
                        document_id: entry["sha256"]
                        for document_id, entry in json.loads(release["artifacts"]).items()
                    },
                }
                if release
                else None
            ),
            "started_at": started_at,
            "finished_at": _now(),
            "label": "Demo setup reset. Fictional data; not a customer action.",
        }
    finally:
        WORKSPACE_LOCK.release()
