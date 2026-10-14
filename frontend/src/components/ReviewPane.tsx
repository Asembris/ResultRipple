import { useEffect, useState } from "react";

import { approvePlan, candidateUrl, fetchPlan, issueRelease, rejectPlan } from "../api";
import type { Actor, Plan, Workspace } from "../types";

/**
 * Review and editions: the raw request, the proposed alternative, the actual
 * candidate bytes, and two separate human actions. The pane makes no permission
 * decision of its own; it shows what the server allows and reports refusals.
 */
export default function ReviewPane({
  state,
  actor,
  onChange,
  onError,
}: {
  state: Workspace;
  actor: Actor | null;
  onChange: () => Promise<void>;
  onError: (error: unknown) => void;
}) {
  const current = state.cases.find((c) => c.source_ref === "DX-2026-0914");
  const latest = current?.plans.at(-1);
  const [plan, setPlan] = useState<Plan | null>(null);
  const [acknowledged, setAcknowledged] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!latest) {
      setPlan(null);
      return;
    }
    fetchPlan(latest.plan_id).then(setPlan).catch(onError);
  }, [latest?.plan_id, latest?.status, state.context_revision]);

  if (!current || !plan) return null;

  const isCurrentReviewer = actor?.person_id === state.decision?.current_reviewer_id;
  const assignedHere = plan.assigned_reviewer_id === state.decision?.current_reviewer_id;

  const run = async (action: () => Promise<unknown>) => {
    setBusy(true);
    try {
      await action();
      await onChange();
    } catch (error) {
      onError(error);
      await onChange();
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="panel" aria-labelledby="review-heading">
      <h2 id="review-heading">Review and editions</h2>
      <p className="panel__lead">
        Plan {plan.plan_id} &middot; version {plan.version} &middot; status{" "}
        <strong>{plan.status.replace(/_/g, " ").toLowerCase()}</strong>
      </p>

      <div className="card">
        <dl className="fingerprint">
          <div>
            <dt>Assigned reviewer</dt>
            <dd>
              {plan.assigned_reviewer_name ?? plan.assigned_reviewer_id}
              {!assignedHere && (
                <span className="flag flag--stale"> no longer the current reviewer</span>
              )}
            </dd>
          </div>
          <div>
            <dt>Content hash</dt>
            <dd className="hash">{plan.content_hash.slice(0, 16)}&hellip;</dd>
          </div>
          <div>
            <dt>Execution fingerprint</dt>
            <dd className="hash">{plan.execution_fingerprint.slice(0, 16)}&hellip;</dd>
          </div>
          <div>
            <dt>Registered scope</dt>
            <dd>{plan.covered_occurrence_ids.length} occurrences in {Object.keys(plan.candidates).length} documents</dd>
          </div>
        </dl>
        {plan.invalidation_reason && (
          <p className="flag flag--held">
            Previous approval invalidated: <strong>{plan.invalidation_reason}</strong>
          </p>
        )}
      </div>

      <div className="card">
        <h3>Proposed candidates</h3>
        <ul className="candidates">
          {Object.entries(plan.candidates).map(([documentId, sha]) => (
            <li key={documentId}>
              <a href={candidateUrl(plan.plan_id, documentId)} target="_blank" rel="noreferrer">
                Preview {documentId}
              </a>{" "}
              <span className="meta hash">draft &middot; sha256 {sha.slice(0, 12)}&hellip;</span>
            </li>
          ))}
        </ul>
        <p className="published">
          <span className="label">Raw request</span>
          {plan.raw_request}
        </p>
        <p className="published">
          <span className="label">Proposed disposition</span>
          {plan.disposition.replace(/_/g, " ").toLowerCase()}
          {plan.alternative_flag && " (an alternative to what was requested)"}
        </p>
        {plan.note && <p className="note">{plan.note}</p>}
        <p className="unassessed">
          The note above is unassessed review commentary. Only the finding cards and the typed
          decision block are checked.
        </p>
      </div>

      <div className="card actions">
        <h3>Human actions</h3>
        {plan.status === "AWAITING_REVIEW" && (
          <>
            <label className="acknowledge">
              <input
                type="checkbox"
                checked={acknowledged}
                onChange={(event) => setAcknowledged(event.target.checked)}
              />
              I acknowledge the proposed alternative to the original request.
            </label>
            <div className="buttons">
              <button
                type="button"
                disabled={!isCurrentReviewer || busy}
                onClick={() => run(() => approvePlan(plan, acknowledged))}
              >
                Approve revision
              </button>
              <button
                type="button"
                className="secondary"
                disabled={!isCurrentReviewer || busy}
                onClick={() => run(() => rejectPlan(plan.plan_id, "Returned to the analyst for changes."))}
              >
                Reject
              </button>
            </div>
          </>
        )}
        {plan.status === "APPROVED" && (
          <div className="buttons">
            <p className="flag flag--ok">
              Approved by {plan.approved_by} at {plan.approved_at}
            </p>
            <button
              type="button"
              disabled={!isCurrentReviewer || busy}
              onClick={() => run(() => issueRelease(plan.plan_id, `${plan.plan_id}-issue`))}
            >
              Issue editions
            </button>
          </div>
        )}
        {plan.status === "ISSUED" && (
          <p className="flag flag--ok">
            Issued. The current package below contains both editions.
          </p>
        )}
        {!isCurrentReviewer && plan.status !== "ISSUED" && (
          <p className="meta">
            Only {state.decision?.current_reviewer_name ?? "the assigned reviewer"} may act here.
            Owning a document does not grant review authority.
          </p>
        )}
      </div>
    </section>
  );
}
