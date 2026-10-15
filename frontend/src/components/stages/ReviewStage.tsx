import { useState } from "react";

import { approvePlan, rejectPlan } from "../../api";
import { money } from "../../workflow";
import type { StageContext } from "./context";

/**
 * Step 4 — the assigned reviewer's decision.
 *
 * Approve and Reject are always clickable for a signed-in person. The frontend
 * makes no permission decision: it sends the request and shows whatever the
 * server returns, including a refusal. The stamp appears only from a returned
 * plan whose status is APPROVED.
 */
export default function ReviewStage({ context }: { context: StageContext }) {
  const { workspace, plan, actor, busy } = context;
  const [acknowledged, setAcknowledged] = useState(false);

  if (!plan) return null;

  const currentReviewerId = workspace.decision?.current_reviewer_id ?? null;
  const assignedIsCurrent = plan.assigned_reviewer_id === currentReviewerId;
  const approved = plan.status === "APPROVED";

  return (
    <div className="rr-stage">
      <h1>
        {plan.assigned_reviewer_name?.split(" ")[0] ?? "The reviewer"} reviews the corrected package.
      </h1>

      <dl className="rr-facts">
        <div>
          <dt>Assigned reviewer</dt>
          <dd>
            {plan.assigned_reviewer_name ?? plan.assigned_reviewer_id}
            {assignedIsCurrent ? " ★" : ""}
          </dd>
        </div>
        <div>
          <dt>Plan</dt>
          <dd>
            v{plan.version} · {plan.disposition}
          </dd>
        </div>
        <div>
          <dt>Content hash</dt>
          <dd>{plan.content_hash.slice(0, 16)}…</dd>
        </div>
        <div>
          <dt>Registered scope</dt>
          <dd>
            {plan.covered_occurrence_ids.length} occurrences · {Object.keys(plan.candidates).length}{" "}
            documents
          </dd>
        </div>
      </dl>

      {!assignedIsCurrent && (
        <div className="rr-alert-coral">
          <div className="rr-alert-coral__label">Assigned reviewer is no longer current</div>
          <div className="rr-alert-coral__meta">
            This plan is assigned to {plan.assigned_reviewer_name ?? plan.assigned_reviewer_id}. The
            graph now names {workspace.decision?.current_reviewer_name ?? "no one"}.
          </div>
        </div>
      )}

      {plan.invalidation_reason && (
        <div className="rr-alert-coral">
          <div className="rr-alert-coral__label">Previous approval invalidated</div>
          <div className="rr-alert-coral__line">{plan.invalidation_reason}</div>
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {workspace.scope
          .filter((doc) => doc.document_id in plan.candidates)
          .map((doc) => {
            const assessment = workspace.assessment.find(
              (entry) => entry.document_id === doc.document_id,
            );
            const hasDecision = doc.blocks.some((block) => block.kind === "decision");
            return (
              <div className="rr-candidate" key={doc.document_id}>
                <div className="rr-candidate__head">
                  <span className="rr-candidate__title">{doc.title}</span>
                  <span className="rr-candidate__style">
                    {doc.occurrences[0]?.card_style ?? ""} · sha{" "}
                    {plan.candidates[doc.document_id].slice(0, 12)}
                  </span>
                </div>
                {assessment?.previous?.text &&
                  (assessment.relation_changed || assessment.magnitude_changed) && (
                    <div className="rr-candidate__was">{assessment.previous.text}</div>
                  )}
                <div className="rr-candidate__now">{assessment?.current.text ?? ""}</div>
                {hasDecision && workspace.decision && (
                  <div className="rr-candidate__decision">
                    Proposal status: <s>{workspace.decision.status.replace(/_/g, " ").toLowerCase()}</s>{" "}
                    → <em>{expectedStatus(plan.disposition)}</em>
                  </div>
                )}
              </div>
            );
          })}
        <button
          type="button"
          className="rr-secondary rr-secondary--self"
          onClick={() => context.openViewer("candidate")}
        >
          Preview both candidates
        </button>
      </div>

      {workspace.comparison && (
        <p className="rr-mono">
          {workspace.comparison.left.lane_name} {money(workspace.comparison.left.mean_display_cents)}{" "}
          · {workspace.comparison.right.lane_name}{" "}
          {money(workspace.comparison.right.mean_display_cents)} · rendered by the deterministic
          engine from current memberships
        </p>
      )}

      {!approved && plan.status === "AWAITING_REVIEW" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <label className={`rr-ack${acknowledged ? " rr-ack--checked" : ""}`}>
            <input
              type="checkbox"
              checked={acknowledged}
              onChange={(event) => setAcknowledged(event.target.checked)}
            />
            <span>I acknowledge the proposed alternative to the original request.</span>
          </label>

          {actor ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <button
                type="button"
                className="rr-primary"
                disabled={busy}
                onClick={() => void context.commit(() => approvePlan(plan, acknowledged))}
              >
                <span>Approve revision as {actor.display_name}</span>
                <span>✓</span>
              </button>
              <button
                type="button"
                className="rr-secondary"
                disabled={busy}
                onClick={() =>
                  void context.commit(() =>
                    rejectPlan(plan.plan_id, "Returned to the analyst for changes."),
                  )
                }
              >
                Reject this plan
              </button>
              <p className="rr-mono">
                Only {workspace.decision?.current_reviewer_name ?? "the assigned reviewer"} may
                approve. Owning a document grants no review authority, and the server decides.
              </p>
            </div>
          ) : (
            <p className="rr-copy">Sign in above as the assigned reviewer to approve.</p>
          )}
        </div>
      )}

      {approved && (
        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          <div className="rr-stamped">
            <div className="rr-stamp">APPROVED</div>
            <div className="rr-stamped__line">
              Approved by{" "}
              {workspace.people.find((person) => person.person_id === plan.approved_by)
                ?.display_name ?? plan.approved_by}
            </div>
            <div className="rr-stamped__meta">
              plan v{plan.version} ·{" "}
              {plan.acknowledged_alternative ? "alternative acknowledged" : "no alternative flagged"} ·
              context rev {plan.context_revision} · {plan.approved_at}
            </div>
          </div>
          <p className="rr-copy">
            Approving and issuing are separate human actions. Nothing has been published yet.
          </p>
          {context.serverStep > 4 && (
            <button type="button" className="rr-primary" onClick={() => context.goTo(5)}>
              <span>Continue: review authority</span>
              <span>→</span>
            </button>
          )}
        </div>
      )}

      {plan.status === "REJECTED" && (
        <div className="rr-alert-coral">
          <div className="rr-alert-coral__label">Plan rejected</div>
          <div className="rr-alert-coral__meta">
            No new editions are current and the proposal keeps its recorded status.
          </div>
        </div>
      )}

      <p className="rr-scope">{workspace.verification_scope}</p>
    </div>
  );
}

function expectedStatus(disposition: string): string {
  if (disposition === "RETURN_FOR_REVIEW") return "returned for review";
  if (disposition === "HOLD_FOR_CLARIFICATION") return "held for clarification";
  return "unchanged";
}
