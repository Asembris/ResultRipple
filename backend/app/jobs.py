"""Bounded in-process agent jobs, with their consequential state in the graph.

One API worker runs at most a couple of concurrent jobs. A job's observable
progress -- status, completed tool events, usage, elapsed time, the resulting
plan id or the persisted question -- is written to FalkorDB as it happens, so a
restart cannot present an unfinished run as a completed one: startup marks every
non-terminal job `INTERRUPTED`.

No queue, broker, or worker pool is introduced.
"""

from __future__ import annotations

import json
import logging
import threading
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from . import domain
from .agent import TERMINAL_STATES, AgentNotConfigured, AgentRunner
from .agent_tools import STAGEABLE_CASE_STATES, AgentToolbox, ToolCaseMissing, agent_principal
from .artifacts import ArtifactStore
from .config import Settings
from .graph import GraphClient, GraphUnavailable, GuardFailed
from .service import Actor, WorkflowRefused

logger = logging.getLogger("resultripple.agent.jobs")

MAX_REQUEST_CHARS = 2000


def _now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


class AgentJobStore:
    """Tracks the live jobs this process is running and bounds their number."""

    def __init__(self, settings: Settings) -> None:
        self._settings = settings
        self._lock = threading.Lock()
        self._active: set[str] = set()

    # -- admission ------------------------------------------------------------

    def accept(
        self,
        graph: GraphClient,
        *,
        actor: Actor,
        case_id: str,
        request_text: str,
    ) -> dict[str, Any]:
        """Create and persist a queued job, or refuse with a stable code."""
        if actor.demo_role != "analyst":
            raise WorkflowRefused(
                "NOT_AUTHORIZED",
                "an agent run is started by the analyst who owns the request",
                http_status=403,
            )
        if not self._settings.model_configured:
            raise WorkflowRefused(
                "MODEL_NOT_CONFIGURED",
                "no NVIDIA credential is configured, so the agent cannot run; the "
                "manual correction workflow remains available",
                http_status=503,
            )
        text = request_text.strip()
        if not text:
            raise WorkflowRefused(
                "REQUEST_REQUIRED", "say what you want done", http_status=400
            )

        case = graph.case(case_id)
        if case is None:
            raise WorkflowRefused("CASE_UNKNOWN", f"case {case_id}", http_status=404)
        if case["status"] not in STAGEABLE_CASE_STATES:
            raise WorkflowRefused(
                "CASE_STATE",
                f"case is {case['status']}; an agent run needs an applied correction "
                "that is not already under review",
                context={"case_status": case["status"]},
            )

        # One unfinished run per case at a time, so a double click cannot stage
        # twice or burn two inference budgets.
        for row in graph.agent_jobs_for_case(case_id):
            if row["status"] not in TERMINAL_STATES:
                raise WorkflowRefused(
                    "AGENT_RUN_IN_FLIGHT",
                    "a run for this case is still in flight",
                    http_status=409,
                    context={"job_id": row["job_id"], "status": row["status"]},
                )

        with self._lock:
            if len(self._active) >= self._settings.agent_max_concurrent_jobs:
                raise WorkflowRefused(
                    "AGENT_BUSY",
                    "the configured number of concurrent agent jobs is already running",
                    http_status=429,
                    context={"concurrent_limit": self._settings.agent_max_concurrent_jobs},
                )
            job_id = f"job-{uuid.uuid4().hex[:12]}"
            self._active.add(job_id)

        try:
            graph.create_agent_job(
                case_id=case_id,
                job={
                    "job_id": job_id,
                    "status": "QUEUED",
                    "request_text": text[:MAX_REQUEST_CHARS],
                    "requested_by": actor.person_id,
                    "model": self._settings.nvidia_model,
                    "endpoint": self._settings.nvidia_api_base_url,
                    "reasoning": self._settings.nvidia_reasoning,
                    "started_at": _now(),
                    "events": "[]",
                    "usage": "{}",
                },
            )
        except (GuardFailed, GraphUnavailable) as exc:
            self._release(job_id)
            raise WorkflowRefused(
                getattr(exc, "code", "JOB_WRITE_FAILED"),
                getattr(exc, "detail", "the job could not be recorded"),
            ) from exc

        return {
            "job_id": job_id,
            "case_id": case_id,
            "status": "QUEUED",
            "request_text": text[:MAX_REQUEST_CHARS],
            "model": self._settings.nvidia_model,
        }

    def _release(self, job_id: str) -> None:
        with self._lock:
            self._active.discard(job_id)

    @property
    def active_count(self) -> int:
        with self._lock:
            return len(self._active)

    # -- execution ------------------------------------------------------------

    def execute(
        self,
        graph: GraphClient,
        store: ArtifactStore,
        csv_path: Path,
        *,
        job_id: str,
        case_id: str,
        actor: Actor,
        request_text: str,
        runner: AgentRunner | None = None,
        client: Any | None = None,
    ) -> dict[str, Any]:
        """Run one accepted job to a terminal state. Blocking; call it off-loop.

        Every outcome is written to the graph, including failures. Nothing here
        reports a staged plan that was not actually persisted.
        """
        runner = runner or AgentRunner(settings=self._settings)
        toolbox = AgentToolbox(
            graph=graph,
            store=store,
            csv_path=csv_path,
            principal=agent_principal(actor),
            case_id=case_id,
            job_id=job_id,
        )
        events: list[dict[str, Any]] = []

        def persist(event: dict[str, Any]) -> None:
            events.append(event)
            fields: dict[str, Any] = {"events": domain.canonical_json(events)}
            status = _status_for(event)
            if status is not None:
                fields["status"] = status
            try:
                graph.update_agent_job(job_id=job_id, fields=fields)
            except GraphUnavailable:
                # Losing progress visibility must not abort the run itself.
                logger.warning("agent job=%s could not persist progress", job_id)

        try:
            try:
                summary = toolbox.case_summary()
            except ToolCaseMissing as exc:
                return self._record_failure(
                    graph, job_id, "TOOL_ERROR", "CASE_UNKNOWN", str(exc), events
                )
            except GraphUnavailable as exc:
                return self._record_failure(
                    graph, job_id, "TOOL_ERROR", exc.code, exc.detail, events
                )

            try:
                result = runner.run(
                    toolbox,
                    raw_request=request_text,
                    summary=summary,
                    on_event=persist,
                    client=client,
                )
            except AgentNotConfigured as exc:
                return self._record_failure(
                    graph, job_id, "TOOL_ERROR", exc.code, str(exc), events
                )

            fields = {
                "status": result.status,
                "finished_at": _now(),
                "events": domain.canonical_json(result.events),
                "usage": domain.canonical_json(result.usage.as_dict()),
                "tool_call_count": result.tool_calls,
                "model_turn_count": result.model_turns,
                "elapsed_ms": result.elapsed_ms,
            }
            if result.plan_id:
                fields["plan_id"] = result.plan_id
            if result.clarification:
                fields["clarification_field"] = result.clarification["missing_field"]
                fields["clarification_question"] = result.clarification["question"]
            if result.error_code:
                fields["error_code"] = result.error_code
                fields["error_detail"] = (result.error_detail or "")[:400]
            try:
                graph.update_agent_job(job_id=job_id, fields=fields)
            except GraphUnavailable:
                logger.warning("agent job=%s finished but could not be recorded", job_id)
            logger.info(
                "agent job=%s status=%s turns=%s tools=%s elapsed_ms=%s usage=%s plan=%s",
                job_id,
                result.status,
                result.model_turns,
                result.tool_calls,
                result.elapsed_ms,
                result.usage.as_dict(),
                result.plan_id,
            )
            return {
                "job_id": job_id,
                "status": result.status,
                "plan_id": result.plan_id,
                "elapsed_ms": result.elapsed_ms,
                "usage": result.usage.as_dict(),
                "error_code": result.error_code,
            }
        except Exception as exc:  # noqa: BLE001 - a failed run is never a success
            logger.exception("agent job=%s failed unexpectedly", job_id)
            return self._record_failure(
                graph, job_id, "TOOL_ERROR", "AGENT_FAILED", type(exc).__name__, events
            )
        finally:
            self._release(job_id)

    def _record_failure(
        self,
        graph: GraphClient,
        job_id: str,
        status: str,
        code: str,
        detail: str,
        events: list[dict[str, Any]],
    ) -> dict[str, Any]:
        try:
            graph.update_agent_job(
                job_id=job_id,
                fields={
                    "status": status,
                    "finished_at": _now(),
                    "error_code": code,
                    "error_detail": detail[:400],
                    "events": domain.canonical_json(events),
                },
            )
        except GraphUnavailable:
            logger.warning("agent job=%s failed and could not be recorded", job_id)
        return {"job_id": job_id, "status": status, "error_code": code, "plan_id": None}


def _status_for(event: dict[str, Any]) -> str | None:
    """Map a real event to the coarse state the UI follows."""
    if event.get("kind") == "tool_start":
        return {
            "inspect_impact": "INVESTIGATING",
            "get_case_context": "INVESTIGATING",
            "stage_review": "STAGING",
            "request_clarification": "STAGING",
        }.get(str(event.get("tool")))
    if event.get("kind") == "context":
        return "INVESTIGATING"
    return None


def read_job(graph: GraphClient, job_id: str) -> dict[str, Any] | None:
    """The job as recorded, with its JSON columns decoded for the client."""
    row = graph.agent_job(job_id)
    if row is None:
        return None
    row["events"] = json.loads(row["events"]) if row.get("events") else []
    row["usage"] = json.loads(row["usage"]) if row.get("usage") else {}
    row["terminal"] = row["status"] in TERMINAL_STATES
    return row


def interrupt_unfinished(graph: GraphClient) -> int:
    """Startup integrity: an in-flight job from a previous process is finished."""
    return graph.interrupt_unfinished_agent_jobs(
        terminal_states=list(TERMINAL_STATES), at=_now()
    )
