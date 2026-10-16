"""Workflow operations: correction, staging, approval, release, refresh.

Every operation re-reads authoritative context from FalkorDB under the single
in-process workspace lock. Nothing here trusts a client-supplied scope, actor,
reviewer, number, or file path.

Approve revision and Issue editions are separate human actions. Approval binds
to one exact plan version and execution fingerprint; release re-reads the world
and refuses a stale one without touching the current publication pointer.
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from . import domain
from .artifacts import ArtifactStore, RenderedPackage, render_package
from .engine import (
    CaseContext,
    EngineHold,
    assert_impact_covers_scope,
    compute_comparison,
    content_identity,
    execution_identity,
    load_case_context,
    load_comparison,
    load_evidence,
    typed_assertion,
    validate_intent,
)
from .graph import WORKSPACE_LOCK, GraphClient, GuardFailed
from .verify_artifacts import verify_package


class WorkflowRefused(RuntimeError):
    """A refusal with a stable code and a permitted recovery action."""

    def __init__(
        self,
        code: str,
        detail: str,
        *,
        http_status: int = 409,
        context: dict[str, Any] | None = None,
    ) -> None:
        super().__init__(detail)
        self.code = code
        self.detail = detail
        self.http_status = http_status
        self.context = context or {}


@dataclass(frozen=True)
class Actor:
    """Server-resolved identity. A request body can never override this."""

    person_id: str
    display_name: str
    demo_role: str
    review_capable: bool


# Who may prepare a review plan. Review authority is a separate, graph-held fact.
STAGING_ROLES = frozenset({"analyst", "agent"})


def _now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def _context(graph: GraphClient, csv_path: Path) -> CaseContext:
    return load_case_context(
        graph, csv_path, decision_id=domain.DECISION_ID, comparison_id=domain.COMPARISON_ID
    )


# -- evidence correction ------------------------------------------------------


def apply_correction(
    graph: GraphClient,
    *,
    actor: Actor,
    case_id: str,
    batch_ids: list[str],
    expected_revision: int,
) -> dict[str, Any]:
    """Confirm the dispatch source and commit exactly the recorded reassignment."""
    if actor.demo_role != "analyst":
        raise WorkflowRefused(
            "NOT_AUTHORIZED", "only the analyst confirms an evidence correction", http_status=403
        )
    with WORKSPACE_LOCK:
        case = graph.case(case_id)
        if case is None:
            raise WorkflowRefused("CASE_UNKNOWN", f"case {case_id}", http_status=404)
        if case["status"] != "CORRECTION_PENDING":
            raise WorkflowRefused(
                "CASE_STATE", f"case is {case['status']}, not CORRECTION_PENDING"
            )
        # The requested set must be exactly what the source note identifies.
        if sorted(set(batch_ids)) != sorted(case["changed_batch_ids"]):
            raise WorkflowRefused(
                "CORRECTION_SCOPE_MISMATCH",
                "the confirmed batches differ from the ones the source note identifies",
                context={"recorded": case["changed_batch_ids"], "requested": sorted(batch_ids)},
            )
        try:
            applied = graph.apply_correction(
                workspace_id=domain.WORKSPACE_ID,
                case_id=case_id,
                batch_ids=sorted(set(batch_ids)),
                from_lane_id=case["from_lane_id"],
                to_lane_id=case["to_lane_id"],
                expected_revision=expected_revision,
                actor_id=actor.person_id,
                applied_at=_now(),
            )
        except GuardFailed as exc:
            raise WorkflowRefused(exc.code, exc.detail) from exc
        return {
            "case_id": case_id,
            "applied_edge_count": int(applied["applied_edge_count"]),
            "context_revision": int(applied["context_revision"]),
            "actor_id": actor.person_id,
            "source_ref": case["source_ref"],
            "source_note_sha": case["source_note_sha"],
            "from_lane_id": case["from_lane_id"],
            "to_lane_id": case["to_lane_id"],
        }


# -- staging ------------------------------------------------------------------


@dataclass(frozen=True)
class IntentFrame:
    """Typed interpretation of the raw request, shown beside it, never instead."""

    raw_request: str
    goal: str
    disposition: str
    alternative_flag: bool
    note: str
    focus_occurrence_ids: tuple[str, ...] = ()


def _plan_payload(
    *,
    plan_id: str,
    version: int,
    intent: IntentFrame,
    content_hash: str,
    fingerprint: str,
    candidate_hashes: dict[str, str],
    scope: dict[str, Any],
    context: CaseContext,
    staged_by: str,
    idempotency_key: str,
) -> dict[str, Any]:
    return {
        "plan_id": plan_id,
        "version": version,
        "raw_request": intent.raw_request,
        "goal": intent.goal,
        "alternative_flag": intent.alternative_flag,
        "disposition": intent.disposition,
        "note": intent.note,
        "content_hash": content_hash,
        "execution_fingerprint": fingerprint,
        "candidates": domain.canonical_json(candidate_hashes),
        "scope": domain.canonical_json(scope),
        "context_revision": context.context_revision,
        "prior_release_id": context.prior_release_id,
        "staged_at": _now(),
        "idempotency_key": idempotency_key,
        "staged_by": staged_by,
    }


def _scope_record(context: CaseContext, intent: IntentFrame) -> dict[str, Any]:
    """The complete registered scope, enumerated by the engine, not the caller."""
    return {
        "documents": [
            {
                "document_id": doc.document_id,
                "title": doc.title,
                "owner_id": doc.owner_id,
                "owner_name": doc.owner_name,
                "source_revision": doc.source_revision,
                "source_sha": doc.source_sha,
                "blocks": doc.blocks,
            }
            for doc in context.scope.documents
        ],
        "occurrences": [
            {
                "occurrence_id": occ.occurrence_id,
                "document_id": occ.document_id,
                "block_id": occ.block_id,
                "card_style": occ.card_style,
                "claim_id": occ.claim_id,
            }
            for occ in context.scope.occurrences
        ],
        "assessment": context.assessment(),
        "memberships": context.evidence.memberships(),
        "dataset_sha": context.evidence.raw_sha,
        "comparison": {
            "comparison_id": context.definition.comparison_id,
            "dataset_id": context.definition.dataset_id,
            "left_lane_id": context.definition.left_lane_id,
            "left_lane_name": context.definition.left_lane_name,
            "right_lane_id": context.definition.right_lane_id,
            "right_lane_name": context.definition.right_lane_name,
            "min_n": context.definition.min_n,
            "owner_id": context.definition.owner_id,
            "owner_name": context.definition.owner_name,
        },
        "result": context.result.as_dict(),
        "decision": {
            "decision_id": context.authority.decision_id,
            "title": context.authority.decision_title,
            "current_status": context.authority.decision_status,
            "basis_claim_id": context.authority.basis_claim_id,
            "expected_status": domain.DISPOSITION_DECISION_STATUS[intent.disposition],
        },
        "authority": {
            "team_id": context.authority.team_id,
            "team_name": context.authority.team_name,
            "reviewer_id": context.authority.reviewer_id,
            "reviewer_name": context.authority.reviewer_name,
        },
        # Recorded for transparency. It never narrows the scope above.
        "requested_focus": list(intent.focus_occurrence_ids),
        "verification_scope": context.scope.verification_scope(),
    }


def stage_review(
    graph: GraphClient,
    store: ArtifactStore,
    csv_path: Path,
    *,
    actor: Actor,
    case_id: str,
    intent: IntentFrame,
    idempotency_key: str,
    allowed_case_states: tuple[str, ...] = ("CORRECTION_APPLIED", "NEEDS_CHANGES"),
    expected_context_revision: int | None = None,
) -> dict[str, Any]:
    """Render real candidates and persist one review plan for the current reviewer.

    `expected_context_revision` is the revision the caller's investigation saw.
    When it is given it is a precondition, checked here against the same in-lock
    snapshot the candidates are rendered from. Checking it anywhere else would
    leave a window in which an authorized mutation lands between the check and
    the write, and an intent derived from evidence or authority that no longer
    holds would reach a reviewer. The manual path passes nothing and is
    unaffected.

    Only the analyst or the agent principal acting for the analyst prepares a
    review, so the person who approves and issues never also prepared it.
    """
    if actor.demo_role not in STAGING_ROLES:
        raise WorkflowRefused(
            "NOT_AUTHORIZED",
            "only the analyst or the agent acting for the analyst prepares a review",
            http_status=403,
        )
    with WORKSPACE_LOCK:
        case = graph.case(case_id)
        if case is None:
            raise WorkflowRefused("CASE_UNKNOWN", f"case {case_id}", http_status=404)

        existing = graph.plan_by_idempotency_key(case_id, idempotency_key)
        if existing is not None:
            return existing

        if case["status"] not in allowed_case_states:
            raise WorkflowRefused("CASE_STATE", f"case is {case['status']}")

        validate_intent(intent.goal, intent.disposition, intent.alternative_flag)
        context = _context(graph, csv_path)

        # Before the first side effect of any kind: no candidate bytes, no plan,
        # and no case advanced against a world the investigation never saw.
        if (
            expected_context_revision is not None
            and context.context_revision != expected_context_revision
        ):
            raise WorkflowRefused(
                "STALE_INSPECTION",
                "the workspace moved between the investigation and this staging",
                context={
                    "expected_context_revision": expected_context_revision,
                    "current_context_revision": context.context_revision,
                },
            )

        assert_impact_covers_scope(graph, case_id, context.scope)

        content_hash = domain.canonical_sha(
            content_identity(
                context,
                goal=intent.goal,
                disposition=intent.disposition,
                alternative_flag=intent.alternative_flag,
            )
        )
        package = render_package(
            context, disposition=intent.disposition, content_hash=content_hash
        )
        candidate_hashes = package.hashes()

        version = 1 + max(
            (int(row["version"]) for row in graph.plans_for_case(case_id)), default=0
        )
        plan_id = f"plan-{case_id}-v{version}"
        fingerprint = domain.canonical_sha(
            execution_identity(
                content_hash=content_hash,
                candidate_hashes=candidate_hashes,
                reviewer_id=context.authority.reviewer_id,
                context_revision=context.context_revision,
                plan_version=version,
                prior_release_id=context.prior_release_id,
            )
        )
        store.write_candidates(plan_id, package)
        graph.create_plan(
            case_id=case_id,
            plan=_plan_payload(
                plan_id=plan_id,
                version=version,
                intent=intent,
                content_hash=content_hash,
                fingerprint=fingerprint,
                candidate_hashes=candidate_hashes,
                scope=_scope_record(context, intent),
                context=context,
                staged_by=actor.person_id,
                idempotency_key=idempotency_key,
            ),
            occurrence_ids=[occ.occurrence_id for occ in context.scope.occurrences],
            reviewer_id=context.authority.reviewer_id,
        )
        return graph.plan(plan_id) or {}


# -- reviewer-only refresh ----------------------------------------------------


def refresh_review(
    graph: GraphClient, store: ArtifactStore, csv_path: Path, *, actor: Actor, case_id: str
) -> dict[str, Any]:
    """Re-stage the recorded intent for the current reviewer. No inference.

    Permitted only when every semantic and content premise is unchanged and the
    authorized reviewer assignment is the single difference. Prior approval is
    kept as invalid history, never transferred.
    """
    if not (actor.demo_role == "analyst" or actor.review_capable):
        raise WorkflowRefused("NOT_AUTHORIZED", "not a case participant", http_status=403)

    with WORKSPACE_LOCK:
        plans = graph.plans_for_case(case_id)
        if not plans:
            raise WorkflowRefused("NO_PLAN", f"case {case_id} has no plan", http_status=404)
        prior = graph.plan(plans[-1]["plan_id"])
        if prior is None:
            raise WorkflowRefused("NO_PLAN", "latest plan could not be read", http_status=404)
        if prior["status"] == "ISSUED":
            raise WorkflowRefused("ALREADY_ISSUED", "this plan is already published")
        if prior["status"] == "INVALIDATED":
            raise WorkflowRefused(
                "NEW_INVESTIGATION_REQUIRED",
                "this plan was retired because the world moved; stage a new version",
            )

        context = _context(graph, csv_path)
        assert_impact_covers_scope(graph, case_id, context.scope)
        content_hash = domain.canonical_sha(
            content_identity(
                context,
                goal=prior["goal"],
                disposition=prior["disposition"],
                alternative_flag=bool(prior["alternative_flag"]),
            )
        )
        if content_hash != prior["content_hash"]:
            raise WorkflowRefused(
                "NEW_INVESTIGATION_REQUIRED",
                "a content premise changed; this shortcut covers a reviewer change only",
            )
        if context.prior_release_id != (prior["prior_release_id"] or ""):
            raise WorkflowRefused(
                "NEW_INVESTIGATION_REQUIRED", "the prior release changed since staging"
            )
        if context.authority.reviewer_id == prior["assigned_reviewer_id"]:
            raise WorkflowRefused(
                "NO_AUTHORITY_CHANGE", "the assigned reviewer is unchanged; nothing to refresh"
            )

        package = render_package(
            context, disposition=prior["disposition"], content_hash=content_hash
        )
        candidate_hashes = package.hashes()
        if candidate_hashes != json.loads(prior["candidates"]):
            raise WorkflowRefused(
                "NEW_INVESTIGATION_REQUIRED", "candidate bytes would change; restage instead"
            )

        version = int(prior["version"]) + 1
        plan_id = f"plan-{case_id}-v{version}"
        fingerprint = domain.canonical_sha(
            execution_identity(
                content_hash=content_hash,
                candidate_hashes=candidate_hashes,
                reviewer_id=context.authority.reviewer_id,
                context_revision=context.context_revision,
                plan_version=version,
                prior_release_id=context.prior_release_id,
            )
        )
        intent = IntentFrame(
            raw_request=prior["raw_request"],
            goal=prior["goal"],
            disposition=prior["disposition"],
            alternative_flag=bool(prior["alternative_flag"]),
            note=prior["note"],
        )
        store.write_candidates(plan_id, package)
        graph.create_plan(
            case_id=case_id,
            plan=_plan_payload(
                plan_id=plan_id,
                version=version,
                intent=intent,
                content_hash=content_hash,
                fingerprint=fingerprint,
                candidate_hashes=candidate_hashes,
                scope=_scope_record(context, intent),
                context=context,
                staged_by=actor.person_id,
                idempotency_key=f"refresh-{plan_id}",
            ),
            occurrence_ids=[occ.occurrence_id for occ in context.scope.occurrences],
            reviewer_id=context.authority.reviewer_id,
            supersedes_plan_id=prior["plan_id"],
            supersede_reason="AUTHORITY_CHANGED",
        )
        refreshed = graph.plan(plan_id) or {}
        refreshed["refresh"] = {
            "mode": "REVIEWER_ONLY",
            "model_calls": 0,
            "candidate_hashes_preserved": True,
            "previous_plan_id": prior["plan_id"],
            "previous_reviewer_id": prior["assigned_reviewer_id"],
            "current_reviewer_id": context.authority.reviewer_id,
        }
        return refreshed


# -- approval -----------------------------------------------------------------


def approve_plan(
    graph: GraphClient,
    csv_path: Path,
    *,
    actor: Actor,
    plan_id: str,
    version: int,
    fingerprint: str,
    acknowledged_alternative: bool,
) -> dict[str, Any]:
    """Only the currently assigned reviewer may approve this exact plan version."""
    with WORKSPACE_LOCK:
        plan = graph.plan(plan_id)
        if plan is None:
            raise WorkflowRefused("PLAN_UNKNOWN", plan_id, http_status=404)
        if plan["status"] != "AWAITING_REVIEW":
            raise WorkflowRefused("PLAN_STATE", f"plan is {plan['status']}")

        context = _context(graph, csv_path)
        if context.authority.reviewer_id != plan["assigned_reviewer_id"]:
            graph.mark_plan_stale(plan_id=plan_id, reason="AUTHORITY_CHANGED")
            raise WorkflowRefused(
                "AUTHORITY_CHANGED",
                "the assigned reviewer changed; refresh the review",
                context=_authority_witness(plan, context),
            )
        if actor.person_id != context.authority.reviewer_id:
            raise WorkflowRefused(
                "NOT_AUTHORIZED",
                "document ownership and a review-capable identity are not approval authority",
                http_status=403,
                context={"current_reviewer_id": context.authority.reviewer_id},
            )
        if int(version) != int(plan["version"]) or fingerprint != plan["execution_fingerprint"]:
            raise WorkflowRefused(
                "FINGERPRINT_MISMATCH", "approval must name the exact current plan version"
            )
        if bool(plan["alternative_flag"]) and not acknowledged_alternative:
            raise WorkflowRefused(
                "ALTERNATIVE_NOT_ACKNOWLEDGED",
                "the proposed alternative must be acknowledged before approval",
            )
        # Re-derive the fingerprint from the current world before recording it.
        _assert_plan_fresh_or_invalidate(graph, plan, context)
        try:
            graph.approve_plan(
                plan_id=plan_id,
                version=int(plan["version"]),
                fingerprint=plan["execution_fingerprint"],
                reviewer_id=actor.person_id,
                approved_at=_now(),
                acknowledged_alternative=acknowledged_alternative,
            )
        except GuardFailed as exc:
            raise WorkflowRefused(exc.code, exc.detail) from exc
        return graph.plan(plan_id) or {}


def reject_plan(
    graph: GraphClient, csv_path: Path, *, actor: Actor, plan_id: str, reason: str
) -> dict[str, Any]:
    with WORKSPACE_LOCK:
        plan = graph.plan(plan_id)
        if plan is None:
            raise WorkflowRefused("PLAN_UNKNOWN", plan_id, http_status=404)
        context = _context(graph, csv_path)
        if actor.person_id != context.authority.reviewer_id:
            raise WorkflowRefused("NOT_AUTHORIZED", "not the current reviewer", http_status=403)
        if not reason.strip():
            raise WorkflowRefused("REASON_REQUIRED", "a rejection must state a reason")
        try:
            graph.reject_plan(
                plan_id=plan_id, reviewer_id=actor.person_id, reason=reason.strip(), at=_now()
            )
        except GuardFailed as exc:
            raise WorkflowRefused(exc.code, exc.detail) from exc
        return graph.plan(plan_id) or {}


def _authority_witness(plan: dict[str, Any], context: CaseContext) -> dict[str, Any]:
    return {
        "approved_reviewer_id": plan.get("assigned_reviewer_id"),
        "approved_by": plan.get("approved_by"),
        "current_reviewer_id": context.authority.reviewer_id,
        "current_reviewer_name": context.authority.reviewer_name,
        "team_id": context.authority.team_id,
        "context_revision": context.context_revision,
        "plan_context_revision": plan.get("context_revision"),
    }


# Refusals that mean the world moved past this plan. Each retires the plan and
# reopens the case, so the case can be restaged instead of being stranded.
INVALIDATING_REFUSALS = frozenset({"STALE_PLAN", "STALE_CONTEXT", "VERIFICATION_FAILED"})


def _invalidate(graph: GraphClient, plan_id: str, refusal: WorkflowRefused) -> None:
    """Record the refusal on the plan, reopen the case, then refuse.

    Approval is never transferred: the restaged plan is a new version that needs
    a fresh approval. Callers reach this only after the actor check, so only the
    current reviewer's own attempt can retire a plan.
    """
    try:
        graph.invalidate_plan(plan_id=plan_id, reason=refusal.code, at=_now())
    except GuardFailed:
        pass  # Already out of review: the refusal stands either way.
    else:
        refusal.context = {**refusal.context, "plan_invalidated": True, "recovery": "RESTAGE"}
    raise refusal


def _assert_plan_fresh_or_invalidate(
    graph: GraphClient, plan: dict[str, Any], context: CaseContext
) -> None:
    try:
        _assert_plan_fresh(plan, context)
    except WorkflowRefused as refusal:
        if refusal.code not in INVALIDATING_REFUSALS:
            raise
        _invalidate(graph, plan["plan_id"], refusal)


def _assert_plan_fresh(plan: dict[str, Any], context: CaseContext) -> None:
    content_hash = domain.canonical_sha(
        content_identity(
            context,
            goal=plan["goal"],
            disposition=plan["disposition"],
            alternative_flag=bool(plan["alternative_flag"]),
        )
    )
    if content_hash != plan["content_hash"]:
        raise WorkflowRefused(
            "STALE_PLAN",
            "evidence, source blocks, ownership, basis, or intent changed since staging",
        )
    fingerprint = domain.canonical_sha(
        execution_identity(
            content_hash=content_hash,
            candidate_hashes=json.loads(plan["candidates"]),
            reviewer_id=context.authority.reviewer_id,
            context_revision=context.context_revision,
            plan_version=int(plan["version"]),
            prior_release_id=context.prior_release_id,
        )
    )
    if fingerprint != plan["execution_fingerprint"]:
        raise WorkflowRefused(
            "STALE_CONTEXT", "the workspace context moved since this plan was staged"
        )


# -- release ------------------------------------------------------------------


def issue_release(
    graph: GraphClient,
    store: ArtifactStore,
    csv_path: Path,
    *,
    actor: Actor,
    plan_id: str,
    operation_id: str,
) -> dict[str, Any]:
    """Re-read the world, regenerate, verify the bytes, then commit one package."""
    with WORKSPACE_LOCK:
        plan = graph.plan(plan_id)
        if plan is None:
            raise WorkflowRefused("PLAN_UNKNOWN", plan_id, http_status=404)

        # Reconcile a previously committed operation before judging freshness.
        # An operation id reconciles only to a release of this very plan: another
        # plan's release is never reported as this plan being issued.
        committed = graph.release_for_plan(plan_id)
        if committed is not None:
            return {"release": committed, "idempotent": True}
        by_operation = graph.release_by_operation(operation_id)
        if by_operation is not None:
            raise WorkflowRefused(
                "OPERATION_ID_CONFLICT",
                "this operation id already issued a different plan",
                context={"operation_id": operation_id},
            )

        context = _context(graph, csv_path)

        if context.authority.reviewer_id != plan["assigned_reviewer_id"]:
            graph.mark_plan_stale(plan_id=plan_id, reason="AUTHORITY_CHANGED")
            raise WorkflowRefused(
                "AUTHORITY_CHANGED",
                "the approval was recorded under a reviewer who no longer holds this case",
                context=_authority_witness(plan, context),
            )
        if plan["status"] != "APPROVED":
            raise WorkflowRefused(
                _status_refusal_code(plan["status"]), f"plan is {plan['status']}"
            )
        if actor.person_id != context.authority.reviewer_id:
            raise WorkflowRefused(
                "NOT_AUTHORIZED",
                "only the current reviewer may issue this package",
                http_status=403,
                context={"current_reviewer_id": context.authority.reviewer_id},
            )
        _assert_plan_fresh_or_invalidate(graph, plan, context)
        assert_impact_covers_scope(graph, plan["case_id"], context.scope)

        approved_hashes: dict[str, str] = json.loads(plan["candidates"])
        scope = json.loads(plan["scope"])

        # Regenerate from the same fixed recipe and require exact agreement.
        package = render_package(
            context, disposition=plan["disposition"], content_hash=plan["content_hash"]
        )
        if package.hashes() != approved_hashes:
            raise WorkflowRefused(
                "CANDIDATE_MISMATCH",
                "regenerated bytes do not match the approved candidate hashes",
            )
        _assert_staged_candidates_intact(store, plan_id, approved_hashes)

        # Independent audit of the actual bytes about to be issued.
        report = verify_package(
            csv_path=csv_path,
            dataset_sha=context.evidence.raw_sha,
            memberships=context.evidence.memberships(),
            comparison={**scope["comparison"], "dataset_id": context.definition.dataset_id},
            documents=scope["documents"],
            occurrences=scope["occurrences"],
            decision={
                "decision_id": context.authority.decision_id,
                "expected_status": domain.DISPOSITION_DECISION_STATUS[plan["disposition"]],
                "title": context.authority.decision_title,
                "basis_claim_id": context.authority.basis_claim_id,
            },
            artifacts=package.documents,
            expected_hashes=approved_hashes,
        )
        if not report.ok:
            _invalidate(
                graph,
                plan_id,
                WorkflowRefused(
                    "VERIFICATION_FAILED",
                    "independent verification rejected the candidate bytes",
                    context={"failures": [c.name for c in report.failures][:10]},
                ),
            )

        sequence = 1 + len(graph.release_history())
        release_id = f"rel-{sequence:03d}-{plan['content_hash'][:8]}"
        paths = store.issue(release_id, package)
        issued_at = _now()
        artifacts = {
            document_id: {
                "path": paths[document_id],
                "sha256": approved_hashes[document_id],
                "title": _title_for(scope, document_id),
            }
            for document_id in sorted(package.documents)
        }
        receipt = _receipt(
            plan=plan,
            scope=scope,
            context=context,
            report=report,
            actor=actor,
            release_id=release_id,
            issued_at=issued_at,
            operation_id=operation_id,
            artifacts=artifacts,
        )
        try:
            committed_row = graph.commit_release(
                workspace_id=domain.WORKSPACE_ID,
                plan_id=plan_id,
                plan_version=int(plan["version"]),
                fingerprint=plan["execution_fingerprint"],
                expected_revision=context.context_revision,
                expected_prior_release_id=context.prior_release_id,
                decision_id=context.authority.decision_id,
                basis_claim_id=context.authority.basis_claim_id or "",
                decision_status=domain.DISPOSITION_DECISION_STATUS[plan["disposition"]],
                release={
                    "release_id": release_id,
                    "sequence": sequence,
                    "issued_at": issued_at,
                    "artifacts": domain.canonical_json(artifacts),
                    "receipt": domain.canonical_json(receipt),
                    "occurrence_snapshots": domain.canonical_json(scope["assessment"]),
                    "operation_id": operation_id,
                },
                document_ids=[doc["document_id"] for doc in scope["documents"]],
                occurrence_assertions=[
                    [entry["occurrence_id"], domain.canonical_json(entry["current"])]
                    for entry in scope["assessment"]
                ],
            )
        except GuardFailed as exc:
            # Files exist but nothing is current: a private orphan, not a release.
            raise WorkflowRefused(exc.code, exc.detail) from exc

        released = graph.release(str(committed_row["release_id"])) or {}
        return {"release": released, "idempotent": False, "verification": report.as_dict()}


def _status_refusal_code(status: str) -> str:
    return {
        "AWAITING_REVIEW": "NOT_APPROVED",
        "REJECTED": "PLAN_REJECTED",
        "SUPERSEDED": "PLAN_SUPERSEDED",
        "STALE_AUTHORITY": "AUTHORITY_CHANGED",
        "INVALIDATED": "PLAN_INVALIDATED",
        "ISSUED": "ALREADY_ISSUED",
    }.get(status, "PLAN_STATE")


def _assert_staged_candidates_intact(
    store: ArtifactStore, plan_id: str, approved: dict[str, str]
) -> None:
    """The bytes the reviewer was shown must still be the approved bytes."""
    for document_id, expected in approved.items():
        path = store.candidate_path(plan_id, document_id)
        if not path.is_file():
            raise WorkflowRefused("CANDIDATE_MISSING", f"staged candidate for {document_id}")
        if domain.sha256_bytes(path.read_bytes()) != expected:
            raise WorkflowRefused(
                "CANDIDATE_MISMATCH", f"the staged candidate for {document_id} was altered"
            )


def _title_for(scope: dict[str, Any], document_id: str) -> str:
    for document in scope["documents"]:
        if document["document_id"] == document_id:
            return document["title"]
    return document_id


def _verified_scope_statement(scope: dict[str, Any]) -> str:
    """Counted from the inventory the independent verifier just checked."""
    return domain.verification_scope_statement(
        len(scope["occurrences"]),
        sum(
            1
            for document in scope["documents"]
            for block in document["blocks"]
            if block["kind"] == "decision"
        ),
    )


def _receipt(
    *,
    plan: dict[str, Any],
    scope: dict[str, Any],
    context: CaseContext,
    report: Any,
    actor: Actor,
    release_id: str,
    issued_at: str,
    operation_id: str,
    artifacts: dict[str, Any],
) -> dict[str, Any]:
    """Approval and issue metadata live here, never inside the edition bytes."""
    return {
        "release_id": release_id,
        "operation_id": operation_id,
        "issued_at": issued_at,
        "issued_by": actor.person_id,
        "plan_id": plan["plan_id"],
        "plan_version": plan["version"],
        "content_hash": plan["content_hash"],
        "execution_fingerprint": plan["execution_fingerprint"],
        "approved_by": plan["approved_by"],
        "approved_at": plan["approved_at"],
        "acknowledged_alternative": plan.get("acknowledged_alternative"),
        "raw_request": plan["raw_request"],
        "interpreted_goal": plan["goal"],
        "alternative_proposed": plan["alternative_flag"],
        "disposition": plan["disposition"],
        "approved_context_revision": context.context_revision,
        "authority_at_issue": {
            "team_id": context.authority.team_id,
            "reviewer_id": context.authority.reviewer_id,
            "reviewer_name": context.authority.reviewer_name,
        },
        "dataset_sha": context.evidence.raw_sha,
        "membership_sha": context.evidence.membership_sha(),
        "artifacts": artifacts,
        "verification": report.as_dict(),
        "verification_scope": _verified_scope_statement(scope),
    }


# -- guarded demo operator control -------------------------------------------


def reassign_reviewer(
    graph: GraphClient,
    *,
    actor: Actor,
    from_person_id: str,
    to_person_id: str,
    expected_revision: int,
) -> dict[str, Any]:
    """Labelled synthetic rota change. Operator capability only; no model path."""
    if actor.demo_role != "operator":
        raise WorkflowRefused(
            "NOT_AUTHORIZED",
            "a reviewer assignment needs the demo-operator capability",
            http_status=403,
        )
    with WORKSPACE_LOCK:
        try:
            changed = graph.reassign_reviewer(
                workspace_id=domain.WORKSPACE_ID,
                decision_id=domain.DECISION_ID,
                from_person_id=from_person_id,
                to_person_id=to_person_id,
                expected_revision=expected_revision,
                operator_id=actor.person_id,
                source="demo-operator-rota-change",
                at=_now(),
            )
        except GuardFailed as exc:
            raise WorkflowRefused(exc.code, exc.detail) from exc
        return {
            "previous_reviewer_id": changed["previous_reviewer_id"],
            "current_reviewer_id": changed["current_reviewer_id"],
            "context_revision": int(changed["context_revision"]),
            "source": "demo-operator-rota-change",
            "operator_id": actor.person_id,
        }


# -- authoring ----------------------------------------------------------------
#
# The analyst registers a finding from a displayed comparison, places it in
# documents, and records it as a decision basis. Each is one guarded graph
# write keyed by a stable ID: a retry returns what is already there and writes
# nothing, and a request against a revision the analyst did not see is refused.


def _require_analyst(actor: Actor, action: str) -> None:
    if actor.demo_role != "analyst":
        raise WorkflowRefused(
            "NOT_AUTHORIZED", f"only the analyst can {action}", http_status=403
        )


def _require_revision(graph: GraphClient, expected_revision: int) -> int:
    current = int(graph.workspace(domain.WORKSPACE_ID)["context_revision"])
    if current != expected_revision:
        raise WorkflowRefused(
            "STALE_REVISION",
            "the workspace changed since this view was loaded; reload and confirm again",
            context={
                "expected_context_revision": expected_revision,
                "current_context_revision": current,
            },
        )
    return current


def _finding_records(graph: GraphClient) -> dict[str, dict[str, Any]]:
    """Registered findings keyed by claim, with every placement and binding edge."""
    findings: dict[str, dict[str, Any]] = {}
    for row in graph.findings():
        entry = findings.setdefault(
            row["claim_id"],
            {
                "claim_id": row["claim_id"],
                "title": row["title"],
                "approved_by": row["approved_by"],
                "approved_at": row["approved_at"],
                "comparison_ids": set(),
                "binding_edges": set(),
                "occurrences": {},
            },
        )
        if row["binding_edge_id"] is not None:
            entry["binding_edges"].add(row["binding_edge_id"])
            entry["comparison_ids"].add(row["comparison_id"])
        if row["occurrence_id"] is not None:
            entry["occurrences"][row["occurrence_id"]] = {
                "occurrence_id": row["occurrence_id"],
                "document_id": row["document_id"],
                "card_style": row["card_style"],
                "block_id": row["block_id"],
            }
    return findings


def finding_inventory(graph: GraphClient) -> list[dict[str, Any]]:
    """The registry as the publishing desk shows it."""
    return [
        {
            "claim_id": entry["claim_id"],
            "title": entry["title"],
            "approved_by": entry["approved_by"],
            "approved_at": entry["approved_at"],
            "comparison_ids": sorted(entry["comparison_ids"]),
            "occurrences": sorted(
                entry["occurrences"].values(), key=lambda occ: occ["occurrence_id"]
            ),
        }
        for entry in sorted(_finding_records(graph).values(), key=lambda e: e["claim_id"])
    ]


def _approved_finding(graph: GraphClient, claim_id: str) -> dict[str, Any]:
    finding = _finding_records(graph).get(claim_id)
    if finding is None:
        raise WorkflowRefused("FINDING_UNKNOWN", f"finding {claim_id}", http_status=404)
    if len(finding["binding_edges"]) != 1:
        raise WorkflowRefused(
            "MISSING_PROVENANCE" if not finding["binding_edges"] else "DUPLICATE_PROVENANCE",
            f"finding {claim_id} has {len(finding['binding_edges'])} comparison bindings",
        )
    return finding


def comparison_preview(graph: GraphClient, csv_path: Path, comparison_id: str) -> dict[str, Any]:
    """What the analyst is shown before confirming: all of it computed here."""
    try:
        definition = load_comparison(graph, comparison_id)
    except EngineHold as exc:
        if exc.code == "COMPARISON_MISSING":
            raise WorkflowRefused(
                "COMPARISON_UNKNOWN", f"comparison {comparison_id}", http_status=404
            ) from exc
        raise
    evidence = load_evidence(graph, csv_path, definition.dataset_id)
    return _comparison_facts(definition, evidence, compute_comparison(evidence, definition))


def _comparison_facts(definition, evidence, result) -> dict[str, Any]:
    """Dataset, both sides, metric, counts, unit and the generated sentence."""
    assertion = typed_assertion(result, "DOLLARS")
    return {
        "comparison_id": definition.comparison_id,
        "metric_key": definition.metric_key,
        "min_n": definition.min_n,
        "owner_id": definition.owner_id,
        "owner_name": definition.owner_name,
        "dataset_id": definition.dataset_id,
        "dataset_title": definition.dataset_title,
        "dataset_sha": evidence.raw_sha,
        "left": result.left.as_dict(),
        "right": result.right.as_dict(),
        "relation": result.relation,
        "magnitude_cents": result.magnitude_cents,
        "hold_reason": result.hold_reason,
        "unit": assertion["unit"],
        "sentence": assertion["text"],
        "finding_title": (
            f"{definition.right_lane_name} versus {definition.left_lane_name} "
            "mean cost per parcel"
        ),
    }


def create_finding(
    graph: GraphClient,
    csv_path: Path,
    *,
    actor: Actor,
    comparison_id: str,
    expected_revision: int,
    confirmed: bool,
) -> dict[str, Any]:
    """Register the approved finding the analyst confirmed against a comparison."""
    _require_analyst(actor, "register a finding")
    if not confirmed:
        raise WorkflowRefused(
            "BINDING_NOT_CONFIRMED",
            "confirm that this is the intended comparison first",
            http_status=400,
        )
    with WORKSPACE_LOCK:
        preview = comparison_preview(graph, csv_path, comparison_id)
        bound = [
            entry
            for entry in _finding_records(graph).values()
            if comparison_id in entry["comparison_ids"]
        ]
        if len(bound) > 1:
            raise WorkflowRefused(
                "DUPLICATE_PROVENANCE", f"{len(bound)} findings are bound to {comparison_id}"
            )
        if bound:
            current = int(graph.workspace(domain.WORKSPACE_ID)["context_revision"])
            return {
                "claim_id": bound[0]["claim_id"],
                "comparison_id": comparison_id,
                "title": bound[0]["title"],
                "context_revision": current,
                "reused": True,
            }
        _require_revision(graph, expected_revision)
        claim_id = f"claim-{comparison_id}"
        try:
            row = graph.create_finding(
                workspace_id=domain.WORKSPACE_ID,
                comparison_id=comparison_id,
                claim_id=claim_id,
                title=preview["finding_title"],
                actor_id=actor.person_id,
                expected_revision=expected_revision,
                approved_at=_now(),
                statement=domain.FINDING_APPROVAL_STATEMENT,
                witness=domain.canonical_json(preview),
            )
        except GuardFailed as exc:
            raise WorkflowRefused(exc.code, exc.detail) from exc
        return {
            "claim_id": row["claim_id"],
            "comparison_id": comparison_id,
            "title": preview["finding_title"],
            "context_revision": int(row["context_revision"]),
            "reused": False,
        }


def _with_finding_block(blocks: list[dict[str, Any]], block_id: str) -> list[dict[str, Any]]:
    """Place the card after the document's opening narrative block."""
    position = next(
        (index + 1 for index, block in enumerate(blocks) if block["kind"] == "narrative"), 0
    )
    return [*blocks[:position], {"id": block_id, "kind": "finding"}, *blocks[position:]]


def insert_linked_finding(
    graph: GraphClient,
    *,
    actor: Actor,
    document_id: str,
    claim_id: str,
    card_style: str,
    expected_revision: int,
) -> dict[str, Any]:
    """Create, or reuse, the one placement of a finding in a document."""
    _require_analyst(actor, "insert a linked finding")
    if card_style not in domain.ALLOWED_CARD_STYLES:
        raise WorkflowRefused(
            "CARD_STYLE_NOT_ALLOWED", f"style {card_style!r} is not allowlisted", http_status=422
        )
    with WORKSPACE_LOCK:
        document = graph.document(document_id)
        if document is None:
            raise WorkflowRefused("DOCUMENT_UNKNOWN", f"document {document_id}", http_status=404)
        approved_style = domain.TEMPLATE_CARD_STYLES.get(document["template"])
        if card_style != approved_style:
            raise WorkflowRefused(
                "CARD_STYLE_NOT_ALLOWED",
                f"{document['title']} publishes linked findings as {approved_style}",
                http_status=422,
                context={"approved_style": approved_style},
            )
        finding = _approved_finding(graph, claim_id)

        placed = [
            occ for occ in finding["occurrences"].values() if occ["document_id"] == document_id
        ]
        if placed:
            current = int(graph.workspace(domain.WORKSPACE_ID)["context_revision"])
            return {**placed[0], "claim_id": claim_id, "context_revision": current, "reused": True}

        _require_revision(graph, expected_revision)
        blocks = json.loads(document["source_blocks"])
        block_id = f"finding-{claim_id}"
        if any(block["id"] == block_id for block in blocks):
            raise WorkflowRefused(
                "SCOPE_INVENTORY_MISMATCH",
                f"{document_id} already has block {block_id} with no registered occurrence",
            )
        updated = _with_finding_block(blocks, block_id)
        occurrence_id = (
            f"occ-{document_id.removeprefix('doc-')}-{claim_id.removeprefix('claim-')}"
        )
        try:
            row = graph.create_occurrence(
                workspace_id=domain.WORKSPACE_ID,
                document_id=document_id,
                claim_id=claim_id,
                occurrence_id=occurrence_id,
                card_style=card_style,
                block_id=block_id,
                source_blocks=domain.canonical_json(updated),
                source_sha=domain.canonical_sha(updated),
                expected_source_revision=int(document["source_revision"]),
                expected_source_sha=document["source_sha"],
                expected_revision=expected_revision,
                actor_id=actor.person_id,
                registered_at=_now(),
            )
        except GuardFailed as exc:
            raise WorkflowRefused(exc.code, exc.detail) from exc
        return {
            "occurrence_id": row["occurrence_id"],
            "document_id": document_id,
            "claim_id": claim_id,
            "card_style": card_style,
            "block_id": block_id,
            "source_revision": int(row["source_revision"]),
            "context_revision": int(row["context_revision"]),
            "reused": False,
        }


def _decision_document_id(graph: GraphClient) -> str:
    """The one document that carries the typed decision-status block."""
    holders = sorted(
        {
            row["document_id"]
            for row in graph.package_inventory()
            if any(
                block["kind"] == "decision" for block in json.loads(row["source_blocks"] or "[]")
            )
        }
    )
    if len(holders) != 1:
        raise WorkflowRefused(
            "DECISION_BLOCK_AMBIGUOUS", f"{len(holders)} documents carry a decision block"
        )
    return holders[0]


def record_decision_basis(
    graph: GraphClient,
    *,
    actor: Actor,
    decision_id: str,
    claim_id: str,
    expected_revision: int,
    confirmed: bool,
) -> dict[str, Any]:
    """Record an explicit basis. It is never inferred from nearby prose."""
    _require_analyst(actor, "record a decision basis")
    if not confirmed:
        raise WorkflowRefused(
            "BASIS_NOT_CONFIRMED",
            "confirm that this finding is a basis for the proposal first",
            http_status=400,
        )
    with WORKSPACE_LOCK:
        rows = graph.decision_authority(decision_id)
        if not rows:
            raise WorkflowRefused("DECISION_UNKNOWN", f"decision {decision_id}", http_status=404)
        finding = _approved_finding(graph, claim_id)
        bases = {row["basis_claim_id"] for row in rows if row["basis_claim_id"] is not None}
        if bases == {claim_id}:
            current = int(graph.workspace(domain.WORKSPACE_ID)["context_revision"])
            return {
                "decision_id": decision_id,
                "claim_id": claim_id,
                "context_revision": current,
                "reused": True,
            }
        if bases:
            raise WorkflowRefused(
                "BASIS_ALREADY_RECORDED",
                "this decision already records a different basis",
                context={"basis_claim_ids": sorted(bases)},
            )
        decision_document_id = _decision_document_id(graph)
        if not any(
            occ["document_id"] == decision_document_id for occ in finding["occurrences"].values()
        ):
            raise WorkflowRefused(
                "BASIS_REQUIRES_LINKED_FINDING",
                "insert the linked finding into the document that carries the decision first",
                context={"decision_document_id": decision_document_id},
            )
        _require_revision(graph, expected_revision)
        statement = domain.DECISION_BASIS_STATEMENT.format(
            decision_title=rows[0]["decision_title"]
        )
        try:
            row = graph.record_decision_basis(
                workspace_id=domain.WORKSPACE_ID,
                decision_id=decision_id,
                claim_id=claim_id,
                decision_document_id=decision_document_id,
                expected_revision=expected_revision,
                actor_id=actor.person_id,
                recorded_at=_now(),
                statement=statement,
            )
        except GuardFailed as exc:
            raise WorkflowRefused(exc.code, exc.detail) from exc
        return {
            "decision_id": decision_id,
            "claim_id": claim_id,
            "context_revision": int(row["context_revision"]),
            "reused": False,
        }


# -- read model ---------------------------------------------------------------


def workspace_view(graph: GraphClient, csv_path: Path) -> dict[str, Any]:
    """Everything the three surfaces need, straight from current graph context."""
    workspace = graph.workspace(domain.WORKSPACE_ID)
    try:
        context = _context(graph, csv_path)
        hold: dict[str, Any] | None = None
        evidence = {
            "dataset_id": context.evidence.dataset_id,
            "dataset_sha": context.evidence.raw_sha,
            "batches": [
                {"batch_id": b.batch_id, "cost_cents": b.cost_cents, "lane_id": b.lane_id}
                for b in context.evidence.batches
            ],
        }
        comparison = _comparison_facts(context.definition, context.evidence, context.result)
        scope = [
            {
                "document_id": doc.document_id,
                "title": doc.title,
                "owner_id": doc.owner_id,
                "owner_name": doc.owner_name,
                "blocks": doc.blocks,
                "occurrences": [
                    {
                        "occurrence_id": occ.occurrence_id,
                        "block_id": occ.block_id,
                        "card_style": occ.card_style,
                        "claim_id": occ.claim_id,
                    }
                    for occ in doc.occurrences
                ],
                "approved_card_style": domain.TEMPLATE_CARD_STYLES.get(doc.template),
                "has_decision_block": any(b["kind"] == "decision" for b in doc.blocks),
            }
            for doc in context.scope.documents
        ]
        verification_scope = context.scope.verification_scope()
        assessment = context.assessment()
        decision = {
            "decision_id": context.authority.decision_id,
            "title": context.authority.decision_title,
            "status": context.authority.decision_status,
            "basis_claim_id": context.authority.basis_claim_id,
            "team_id": context.authority.team_id,
            "team_name": context.authority.team_name,
            "current_reviewer_id": context.authority.reviewer_id,
            "current_reviewer_name": context.authority.reviewer_name,
        }
    except EngineHold as exc:
        hold = {"code": exc.code, "detail": exc.detail}
        evidence = comparison = decision = None  # type: ignore[assignment]
        scope = []
        assessment = []
        verification_scope = domain.VERIFICATION_SCOPE_UNAVAILABLE

    cases = []
    for row in graph.cases():
        case = graph.case(row["case_id"])
        if case is None:
            continue
        case["plans"] = graph.plans_for_case(case["case_id"])
        case["agent_runs"] = graph.agent_jobs_for_case(case["case_id"])
        cases.append(case)

    current_release_id = workspace["current_release_id"]
    return {
        "workspace_id": workspace["workspace_id"],
        "context_revision": int(workspace["context_revision"]),
        "demo": bool(workspace["demo"]),
        "hold": hold,
        "evidence": evidence,
        "comparison": comparison,
        "scope": scope,
        "assessment": assessment,
        "decision": decision,
        "findings": finding_inventory(graph),
        "cases": cases,
        "current_release": graph.release(current_release_id) if current_release_id else None,
        "releases": graph.release_history(),
        "people": graph.people(),
        "verification_scope": verification_scope,
    }
