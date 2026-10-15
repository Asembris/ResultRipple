import { reassignReviewer } from "../../api";
import type { StageContext } from "./context";

/**
 * Step 5 — the one edge that decides whose approval counts.
 *
 * The reassignment is a guarded operator action. The button is offered to
 * whoever is signed in and the server decides: an ordinary analyst or reviewer
 * gets a real NOT_AUTHORIZED back, which is the point.
 *
 * Until an approval or release is actually attempted, the plan is not stale —
 * it is assigned to someone who no longer holds the case. This panel says
 * exactly that, and never claims an invalidation the backend has not recorded.
 */
export default function AuthorityStage({ context }: { context: StageContext }) {
  const { workspace, plan, actor, busy } = context;
  const decision = workspace.decision;
  if (!decision) return null;

  const currentId = decision.current_reviewer_id;
  const reviewers = workspace.people.filter((person) => person.review_capable);
  const current = reviewers.find((person) => person.person_id === currentId) ?? null;
  const other = reviewers.find((person) => person.person_id !== currentId) ?? null;
  const assignedIsCurrent = !plan?.assigned_reviewer_id || plan.assigned_reviewer_id === currentId;
  const moved = !assignedIsCurrent;
  const assignedName = plan?.assigned_reviewer_name ?? plan?.assigned_reviewer_id ?? "the reviewer";

  return (
    <div className="rr-stage">
      <h1>
        {moved
          ? `Review authority moved from ${assignedName.split(" ")[0]} to ${current?.display_name.split(" ")[0] ?? "someone else"}.`
          : `Review authority can move from ${current?.display_name.split(" ")[0] ?? "the reviewer"} to ${other?.display_name.split(" ")[0] ?? "another reviewer"}.`}
      </h1>

      <div className="rr-edges">
        {reviewers.map((person) => {
          const isCurrent = person.person_id === currentId;
          const wasAssigned = plan?.assigned_reviewer_id === person.person_id;
          const gone = wasAssigned && !isCurrent;
          return (
            <div
              className="rr-edges__row"
              key={person.person_id}
              style={{ opacity: isCurrent || gone ? 1 : 0.22 }}
            >
              <span className="rr-edges__node">{decision.team_name ?? "Owning team"}</span>
              <span className="rr-edges__rel">─[:REVIEWED_BY]→</span>
              <span
                className={`rr-edges__person${
                  gone ? " rr-edges__person--gone" : isCurrent ? "" : " rr-edges__person--idle"
                }`}
              >
                {person.display_name}
                {isCurrent ? " ★" : ""}
              </span>
            </div>
          );
        })}
      </div>

      <p className="rr-copy">
        {other?.display_name ?? "The other reviewer"} may own a document, yet ownership grants no
        review authority. This one edge decides whose approval counts. Replacing it changes no
        candidate byte.
      </p>

      {!moved && other && (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {actor ? (
            <button
              type="button"
              className="rr-primary"
              disabled={busy}
              onClick={() =>
                void context.commit(() =>
                  reassignReviewer(
                    currentId ?? "",
                    other.person_id,
                    workspace.context_revision,
                  ),
                )
              }
            >
              <span>Reassign review authority to {other.display_name}</span>
              <span>→</span>
            </button>
          ) : (
            <p className="rr-copy">Sign in above to attempt the reassignment.</p>
          )}
          <p className="rr-mono">
            A reviewer assignment needs the demo-operator capability. Anyone may attempt it; the
            server resolves the identity and refuses the rest. No agent can invoke it.
          </p>
        </div>
      )}

      {moved && (
        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          <div className="rr-alert-coral">
            <div className="rr-alert-coral__label">Assigned reviewer is no longer current</div>
            <div className="rr-alert-coral__line">
              {assignedName}&apos;s approval was recorded under an assignment that no longer holds.
            </div>
            <div className="rr-alert-coral__meta">
              Nothing is invalidated until a release or approval is attempted — the backend decides
              that, not this screen. Candidate bytes are unchanged · context rev{" "}
              {workspace.context_revision}
            </div>
          </div>
          {context.serverStep > 5 && (
            <button type="button" className="rr-primary" onClick={() => context.goTo(6)}>
              <span>Next: {assignedName.split(" ")[0]} tries to issue</span>
              <span>→</span>
            </button>
          )}
        </div>
      )}
    </div>
  );
}
