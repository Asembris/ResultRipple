"""HTTP boundaries.

Every mutation resolves the workspace and the actor from the signed session.
Errors carry a stable code, the current context revision where it is safe to
expose, and enough witness for the UI to show why an action was refused.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Annotated, Any

import anyio
from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from fastapi.responses import HTMLResponse, JSONResponse

from . import domain, service
from .artifacts import ArtifactStore
from .auth import current_actor, issue_session, optional_actor
from .config import Settings, get_settings
from .deps import get_artifact_store, get_dataset_path, get_graph_client
from .engine import EngineHold
from .graph import GraphClient, GraphUnavailable
from .models import (
    ApplyCorrectionRequest,
    ApprovalRequest,
    DemoSessionRequest,
    RejectionRequest,
    ReleaseRequest,
    ReviewerAssignmentRequest,
    SessionResponse,
    StageReviewRequest,
)
from .service import Actor, WorkflowRefused

router = APIRouter()

GraphDep = Annotated[GraphClient, Depends(get_graph_client)]
StoreDep = Annotated[ArtifactStore, Depends(get_artifact_store)]
CsvDep = Annotated[Path, Depends(get_dataset_path)]
SettingsDep = Annotated[Settings, Depends(get_settings)]
ActorDep = Annotated[Actor, Depends(current_actor)]


async def _offload(function, /, *args, **kwargs):
    """The FalkorDB client is synchronous; keep the event loop responsive."""

    def call():
        return function(*args, **kwargs)

    return await anyio.to_thread.run_sync(call)


def _fail(exc: Exception) -> HTTPException:
    if isinstance(exc, WorkflowRefused):
        return HTTPException(
            exc.http_status, {"code": exc.code, "detail": exc.detail, "context": exc.context}
        )
    if isinstance(exc, EngineHold):
        return HTTPException(
            status.HTTP_409_CONFLICT,
            {"code": exc.code, "detail": exc.detail, "context": exc.context},
        )
    if isinstance(exc, GraphUnavailable):
        # No FalkorDB means no new impact, review, or release answer.
        return HTTPException(
            status.HTTP_503_SERVICE_UNAVAILABLE, {"code": exc.code, "detail": exc.detail}
        )
    raise exc


# -- session ------------------------------------------------------------------


@router.post("/auth/demo-session", response_model=SessionResponse, tags=["auth"])
async def create_demo_session(
    body: DemoSessionRequest,
    response: Response,
    graph: GraphDep,
    settings: SettingsDep,
) -> SessionResponse:
    """Authenticate a provisioned demo identity. Capability comes from the graph."""
    try:
        person = await _offload(graph.person, body.person_id)
    except GraphUnavailable as exc:
        raise _fail(exc) from exc
    if person is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "unknown demo identity")
    actor = Actor(
        person_id=person["person_id"],
        display_name=person["display_name"],
        demo_role=person["demo_role"],
        review_capable=bool(person["review_capable"]),
    )
    issue_session(response, settings, actor)
    return SessionResponse(**actor.__dict__)


@router.get("/auth/session", tags=["auth"])
async def read_session(
    actor: Annotated[Actor | None, Depends(optional_actor)],
) -> dict[str, Any]:
    return {"actor": actor.__dict__ if actor else None}


# -- read model ---------------------------------------------------------------


@router.get("/workspace", tags=["workspace"])
async def read_workspace(graph: GraphDep, csv_path: CsvDep) -> dict[str, Any]:
    """Current evidence, registered scope, decision, cases, and releases."""
    try:
        return await _offload(service.workspace_view, graph, csv_path)
    except (GraphUnavailable, EngineHold) as exc:
        raise _fail(exc) from exc


@router.get("/comparisons/{comparison_id}", tags=["workspace"])
async def read_comparison(
    comparison_id: str, graph: GraphDep, csv_path: CsvDep
) -> dict[str, Any]:
    """Approved definition and live counts, computed from current graph state."""
    from .engine import compute_comparison, load_comparison, load_evidence

    def read() -> dict[str, Any]:
        definition = load_comparison(graph, comparison_id)
        evidence = load_evidence(graph, csv_path, definition.dataset_id)
        result = compute_comparison(evidence, definition)
        return {
            "comparison_id": definition.comparison_id,
            "metric_key": definition.metric_key,
            "min_n": definition.min_n,
            "owner_id": definition.owner_id,
            "owner_name": definition.owner_name,
            "dataset_id": definition.dataset_id,
            "dataset_sha": evidence.raw_sha,
            "result": result.as_dict(),
        }

    try:
        return await _offload(read)
    except (GraphUnavailable, EngineHold) as exc:
        raise _fail(exc) from exc


# -- correction ---------------------------------------------------------------


@router.post("/corrections/{case_id}/apply", tags=["case"])
async def apply_correction(
    case_id: str, body: ApplyCorrectionRequest, actor: ActorDep, graph: GraphDep
) -> dict[str, Any]:
    if not body.source_confirmed:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            {"code": "SOURCE_NOT_CONFIRMED", "detail": "confirm the dispatch source first"},
        )
    try:
        return await _offload(
            service.apply_correction,
            graph,
            actor=actor,
            case_id=case_id,
            batch_ids=body.batch_ids,
            expected_revision=body.expected_context_revision,
        )
    except (WorkflowRefused, EngineHold, GraphUnavailable) as exc:
        raise _fail(exc) from exc


@router.post("/cases/{case_id}/stage-review", tags=["case"])
async def stage_review(
    case_id: str,
    body: StageReviewRequest,
    actor: ActorDep,
    graph: GraphDep,
    store: StoreDep,
    csv_path: CsvDep,
) -> dict[str, Any]:
    """Deterministic staging of a typed intent frame.

    Phase 2 stages a manually chosen intent; the runtime model will drive the
    same tool in the next branch. Either way the engine, not the caller, decides
    the scope, the numbers, and the factual wording.
    """
    intent = service.IntentFrame(
        raw_request=body.raw_request,
        goal=body.goal,
        disposition=body.disposition,
        alternative_flag=body.alternative_flag,
        note=body.note,
        focus_occurrence_ids=tuple(body.focus_occurrence_ids),
    )
    try:
        return await _offload(
            service.stage_review,
            graph,
            store,
            csv_path,
            actor=actor,
            case_id=case_id,
            intent=intent,
            idempotency_key=body.idempotency_key,
        )
    except (WorkflowRefused, EngineHold, GraphUnavailable) as exc:
        raise _fail(exc) from exc


@router.post("/cases/{case_id}/refresh-review", tags=["case"])
async def refresh_review(
    case_id: str, actor: ActorDep, graph: GraphDep, store: StoreDep, csv_path: CsvDep
) -> dict[str, Any]:
    try:
        return await _offload(
            service.refresh_review,
            graph,
            store,
            csv_path,
            actor=actor,
            case_id=case_id,
        )
    except (WorkflowRefused, EngineHold, GraphUnavailable) as exc:
        raise _fail(exc) from exc


# -- review -------------------------------------------------------------------


@router.get("/plans/{plan_id}", tags=["review"])
async def read_plan(plan_id: str, graph: GraphDep) -> dict[str, Any]:
    try:
        plan = await _offload(graph.plan, plan_id)
    except GraphUnavailable as exc:
        raise _fail(exc) from exc
    if plan is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "unknown plan")
    plan["scope"] = json.loads(plan["scope"]) if plan["scope"] else None
    plan["candidates"] = json.loads(plan["candidates"]) if plan["candidates"] else {}
    return plan


@router.get("/plans/{plan_id}/candidates/{document_id}", tags=["review"])
async def read_candidate(
    plan_id: str, document_id: str, graph: GraphDep, store: StoreDep
) -> Response:
    """Serve a staged draft. The wrapper, not the file, carries the draft label."""
    try:
        plan = await _offload(graph.plan, plan_id)
    except GraphUnavailable as exc:
        raise _fail(exc) from exc
    if plan is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "unknown plan")
    candidates = json.loads(plan["candidates"]) if plan["candidates"] else {}
    if document_id not in candidates:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "document is not in this plan")
    path = store.candidate_path(plan_id, document_id)
    if not path.is_file():
        raise HTTPException(status.HTTP_404_NOT_FOUND, "candidate bytes are not staged")
    body = path.read_bytes()
    return HTMLResponse(
        content=body.decode("utf-8"),
        headers={
            "X-ResultRipple-Draft": "true",
            "X-ResultRipple-Sha256": domain.sha256_bytes(body),
            "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'",
        },
    )


@router.post("/plans/{plan_id}/approve", tags=["review"])
async def approve(
    plan_id: str, body: ApprovalRequest, actor: ActorDep, graph: GraphDep, csv_path: CsvDep
) -> dict[str, Any]:
    try:
        return await _offload(
            service.approve_plan,
            graph,
            csv_path,
            actor=actor,
            plan_id=plan_id,
            version=body.plan_version,
            fingerprint=body.execution_fingerprint,
            acknowledged_alternative=body.acknowledged_alternative,
        )
    except (WorkflowRefused, EngineHold, GraphUnavailable) as exc:
        raise _fail(exc) from exc


@router.post("/plans/{plan_id}/reject", tags=["review"])
async def reject(
    plan_id: str, body: RejectionRequest, actor: ActorDep, graph: GraphDep, csv_path: CsvDep
) -> dict[str, Any]:
    try:
        return await _offload(
            service.reject_plan,
            graph,
            csv_path,
            actor=actor,
            plan_id=plan_id,
            reason=body.reason,
        )
    except (WorkflowRefused, EngineHold, GraphUnavailable) as exc:
        raise _fail(exc) from exc


@router.post("/plans/{plan_id}/release", tags=["review"])
async def release(
    plan_id: str,
    body: ReleaseRequest,
    actor: ActorDep,
    graph: GraphDep,
    store: StoreDep,
    csv_path: CsvDep,
) -> dict[str, Any]:
    try:
        return await _offload(
            service.issue_release,
            graph,
            store,
            csv_path,
            actor=actor,
            plan_id=plan_id,
            operation_id=body.operation_id,
        )
    except (WorkflowRefused, EngineHold, GraphUnavailable) as exc:
        raise _fail(exc) from exc


# -- editions -----------------------------------------------------------------


@router.get("/editions/{release_id}/{document_id}", tags=["editions"])
async def read_edition(
    release_id: str,
    document_id: str,
    request: Request,
    graph: GraphDep,
    store: StoreDep,
) -> Response:
    """Serve only an allowlisted path recorded in a committed release."""
    try:
        released = await _offload(graph.release, release_id)
    except GraphUnavailable as exc:
        raise _fail(exc) from exc
    if released is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "unknown release")
    artifacts = json.loads(released["artifacts"]) if released["artifacts"] else {}
    entry = artifacts.get(document_id)
    if entry is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "document is not in this release")
    try:
        body = store.read(entry["path"])
    except EngineHold as exc:
        raise _fail(exc) from exc
    digest = domain.sha256_bytes(body)
    if digest != entry["sha256"]:
        # An intact historical file is not corrupt merely because context moved;
        # a changed one is, and it is never served as the issued edition.
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            {"code": "ARTIFACT_CORRUPT", "detail": f"{document_id} no longer hashes as issued"},
        )
    headers = {
        "X-ResultRipple-Sha256": digest,
        "X-ResultRipple-Release": release_id,
        "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'",
    }
    if request.query_params.get("download") == "1":
        headers["Content-Disposition"] = f'attachment; filename="{document_id}.html"'
    return HTMLResponse(content=body.decode("utf-8"), headers=headers)


@router.get("/releases/{release_id}/receipt", tags=["editions"])
async def read_receipt(release_id: str, graph: GraphDep) -> dict[str, Any]:
    try:
        released = await _offload(graph.release, release_id)
    except GraphUnavailable as exc:
        raise _fail(exc) from exc
    if released is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "unknown release")
    return json.loads(released["receipt"]) if released["receipt"] else {}


# -- guarded demo operator control -------------------------------------------


@router.post("/demo/reviewer-assignment", tags=["demo"])
async def reviewer_assignment(
    body: ReviewerAssignmentRequest, actor: ActorDep, graph: GraphDep
) -> dict[str, Any]:
    try:
        return await _offload(
            service.reassign_reviewer,
            graph,
            actor=actor,
            from_person_id=body.from_person_id,
            to_person_id=body.to_person_id,
            expected_revision=body.expected_context_revision,
        )
    except (WorkflowRefused, EngineHold, GraphUnavailable) as exc:
        raise _fail(exc) from exc


def refusal_handler(_: Request, exc: HTTPException) -> JSONResponse:
    """Keep the typed refusal body shape stable for the frontend."""
    detail = exc.detail
    if isinstance(detail, dict):
        return JSONResponse(status_code=exc.status_code, content=detail)
    return JSONResponse(
        status_code=exc.status_code, content={"code": "ERROR", "detail": str(detail)}
    )
