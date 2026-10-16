import { approvePlan, issueRelease, refreshReview } from "../../api";
import RefusalCard from "../RefusalCard";
import type { StageContext } from "./context";
import { useAcknowledgement } from "./useAcknowledgement";

/**
 * Step 6 — the refused release, the fresh plan, and the new approval.
 *
 * The issue button stays clickable for whoever is signed in, including the
 * reviewer whose approval is no longer current. That is the only way the real
 * `AUTHORITY_CHANGED` refusal can happen: the server re-reads authority and
 * declines, and the witness it returns is printed verbatim.
 */
export default function FreshApprovalStage({ context }: { context: StageContext }) {
  const { workspace, plan, priorPlan, actor, busy, refusal, kase } = context;
  const [acknowledged, setAcknowledged] = useAcknowledgement(actor, plan);

  if (!plan || !kase) return null;

  const currentId = workspace.decision?.current_reviewer_id ?? null;
  const assignedIsCurrent = plan.assigned_reviewer_id === currentId;
  const authorityRefusal = refusal?.code === "AUTHORITY_CHANGED" ? refusal : null;
  const refused = plan.status === "STALE_AUTHORITY" || !!authorityRefusal;
  const isFresh = kase.plans.length > 1;
  const identical =
    !!priorPlan &&
    JSON.stringify(Object.values(priorPlan.candidates).sort()) ===
      JSON.stringify(Object.values(plan.candidates).sort());

  const assignedName = plan.assigned_reviewer_name ?? plan.assigned_reviewer_id ?? "the reviewer";
  const currentName = workspace.decision?.current_reviewer_name ?? "no one";
  const nameOf = (id: string | null | undefined) =>
    workspace.people.find((person) => person.person_id === id)?.display_name ?? id ?? null;
  const first = (name: string | null) => name?.split(" ")[0] ?? "The reviewer";

  // The previous version's own record: who approved it, why it was retired,
  // and which attempt the server refused, if one was made at all.
  const history =
    isFresh && priorPlan?.invalidation_reason === "AUTHORITY_CHANGED" ? priorPlan : null;
  const priorApprover = nameOf(history?.approved_by);
  const freshApprover = plan.approved_by ? nameOf(plan.approved_by) : null;
  const historyLines: string[] = [];
  if (history) {
    if (priorApprover) {
      historyLines.push(
        identical
          ? `${first(priorApprover)} approved these same files.`
          : `${first(priorApprover)} approved plan v${history.version}.`,
      );
    }
    if (history.refused_action === "RELEASE") {
      historyLines.push(
        `The release was refused because the reviewer changed (${history.invalidation_reason}).`,
      );
    } else if (history.refused_action === "APPROVAL") {
      historyLines.push(
        `An approval was refused because the reviewer changed (${history.invalidation_reason}).`,
      );
    } else if (priorApprover) {
      historyLines.push(
        `That approval no longer counts because the reviewer changed (${history.invalidation_reason}).`,
      );
    } else {
      historyLines.push(
        `Plan v${history.version} was retired because the reviewer changed (${history.invalidation_reason}).`,
      );
    }
    if (freshApprover) historyLines.push(`${first(freshApprover)} approved again.`);
  }

  return (
    <div className="rr-stage">
      {!isFresh && (
        <>
          <h1>{assignedName.split(" ")[0]} tries to issue the editions.</h1>
          <p className="rr-copy">
            Release re-reads the authoritative context before anything is written.
          </p>
          {actor ? (
            <button
              type="button"
              className="rr-primary"
              disabled={busy || plan.status === "ISSUED"}
              onClick={() =>
                void context.commit(() => issueRelease(plan.plan_id, `${plan.plan_id}-issue`))
              }
            >
              <span>Issue editions as {actor.display_name}</span>
              <span>→</span>
            </button>
          ) : (
            <p className="rr-copy">Sign in above to attempt the release.</p>
          )}
        </>
      )}

      {authorityRefusal && <RefusalCard refusal={authorityRefusal} prominent />}

      {!authorityRefusal && plan.status === "STALE_AUTHORITY" && (
        <div className="rr-alert-coral">
          <div className="rr-alert-coral__label">Approval invalidated</div>
          <div className="rr-alert-coral__line">
            {plan.invalidation_reason ?? "AUTHORITY_CHANGED"} — this plan version can no longer
            release.
          </div>
          <div className="rr-alert-coral__meta">
            Recorded by the server when the release was attempted. Candidate bytes are unchanged.
          </div>
        </div>
      )}

      {refused && !isFresh && (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <p className="rr-copy">
            The corrected candidates are still right. What changed is who may authorise them.
          </p>
          {actor ? (
            <button
              type="button"
              className="rr-primary"
              disabled={busy}
              onClick={() => void context.commit(() => refreshReview(kase.case_id))}
            >
              <span>Refresh the review for {currentName}</span>
              <span>→</span>
            </button>
          ) : (
            <p className="rr-copy">Sign in above to refresh the review.</p>
          )}
          <p className="rr-mono">
            A deterministic restage for a reviewer-only change. No model call, no transferred
            approval.
          </p>
        </div>
      )}

      {isFresh && (
        <>
          <h1>A fresh review for {plan.assigned_reviewer_name ?? currentName}.</h1>
          <div className="rr-planv2">
            <div className="rr-planv2__label">Plan v{plan.version} · fresh review</div>
            <div className="rr-planv2__line">
              Assigned to {plan.assigned_reviewer_name ?? plan.assigned_reviewer_id}
              {assignedIsCurrent ? " ★" : ""}
            </div>
            <div className="rr-planv2__hashes">
              {priorPlan && (
                <>
                  <span className="rr-k">v{priorPlan.version} candidates</span>
                  <span className="rr-v">
                    {Object.values(priorPlan.candidates)
                      .map((hash) => hash.slice(0, 12))
                      .join(" · ")}
                  </span>
                  <span />
                </>
              )}
              <span className="rr-k">v{plan.version} candidates</span>
              <span className="rr-v rr-v--now">
                {Object.values(plan.candidates)
                  .map((hash) => hash.slice(0, 12))
                  .join(" · ")}
              </span>
              <span className="rr-identical">{identical ? "IDENTICAL" : ""}</span>
            </div>
            <div className="rr-planv2__note">
              {identical
                ? "Same bytes, new authority. The approval must come from the current reviewer."
                : "Candidate bytes differ from the previous version."}
            </div>
          </div>

          {history && historyLines.length > 0 && (
            <div className="rr-history" aria-label="Recorded approval history">
              <div className="rr-history__label">What happened to plan v{history.version}</div>
              {historyLines.map((line) => (
                <div className="rr-history__line" key={line}>
                  {line}
                </div>
              ))}
              <div className="rr-history__meta">
                {[
                  history.approved_at && `v${history.version} approved ${history.approved_at}`,
                  history.refused_at && `refused ${history.refused_at}`,
                  plan.approved_at && `v${plan.version} approved ${plan.approved_at}`,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </div>
            </div>
          )}

          {plan.status === "AWAITING_REVIEW" && (
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
                <button
                  type="button"
                  className="rr-primary"
                  disabled={busy}
                  onClick={() => void context.commit(() => approvePlan(plan, acknowledged))}
                >
                  <span>Approve revision as {actor.display_name}</span>
                  <span>✓</span>
                </button>
              ) : (
                <p className="rr-copy">Sign in above as the current reviewer to approve.</p>
              )}
              <p className="rr-mono">
                Only {currentName} may approve plan v{plan.version}. Anyone may try; the server
                resolves the identity.
              </p>
            </div>
          )}

          {plan.status === "APPROVED" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <div className="rr-stamped">
                <div className="rr-stamp">APPROVED</div>
                <div className="rr-stamped__line">
                  Approved by{" "}
                  {workspace.people.find((person) => person.person_id === plan.approved_by)
                    ?.display_name ?? plan.approved_by}
                </div>
                <div className="rr-stamped__meta">
                  plan v{plan.version} · current reviewer · context rev {plan.context_revision} ·{" "}
                  {plan.approved_at}
                </div>
              </div>
              {actor ? (
                <button
                  type="button"
                  className="rr-primary"
                  disabled={busy}
                  onClick={() =>
                    void context.commit(() => issueRelease(plan.plan_id, `${plan.plan_id}-issue`))
                  }
                >
                  <span>Issue editions as {actor.display_name}</span>
                  <span>→</span>
                </button>
              ) : (
                <p className="rr-copy">Sign in above to issue the editions.</p>
              )}
            </div>
          )}
        </>
      )}

      {refusal && !authorityRefusal && (
        <RefusalCard refusal={refusal} onDismiss={context.dismissRefusal} />
      )}

      <p className="rr-scope">{workspace.verification_scope}</p>
    </div>
  );
}
