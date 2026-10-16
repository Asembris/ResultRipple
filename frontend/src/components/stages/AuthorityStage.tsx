import { reassignReviewer } from "../../api";
import { caseFinished } from "../../workflow";
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
 *
 * Once a reviewer-only refresh has replaced a plan, the move is history: the
 * previous version records who held the case and why it was retired.
 */
export default function AuthorityStage({ context }: { context: StageContext }) {
  const { workspace, plan, priorPlan, actor, busy, kase } = context;
  const decision = workspace.decision;
  if (!decision) return null;

  const currentId = decision.current_reviewer_id;
  const reviewers = workspace.people.filter((person) => person.review_capable);
  const current = reviewers.find((person) => person.person_id === currentId) ?? null;
  const other = reviewers.find((person) => person.person_id !== currentId) ?? null;
  const first = (name: string | null | undefined) => name?.split(" ")[0] ?? null;

  // A move not yet acted on: the latest plan names someone who no longer holds the case.
  const liveMoved = !!plan?.assigned_reviewer_id && plan.assigned_reviewer_id !== currentId;
  // A move already acted on: the previous version was retired for exactly this.
  const recorded =
    !liveMoved &&
    priorPlan?.invalidation_reason === "AUTHORITY_CHANGED" &&
    !!priorPlan.assigned_reviewer_id &&
    priorPlan.assigned_reviewer_id !== plan?.assigned_reviewer_id
      ? priorPlan
      : null;
  const assignedName = plan?.assigned_reviewer_name ?? plan?.assigned_reviewer_id ?? "the reviewer";
  const movedFrom = liveMoved
    ? assignedName
    : recorded
      ? (recorded.assigned_reviewer_name ?? recorded.assigned_reviewer_id)
      : null;
  const movedFromId = liveMoved ? plan?.assigned_reviewer_id : recorded?.assigned_reviewer_id;
  const done = caseFinished(kase);
  // Only a plan the server has actually recorded an approval on can have an
  // approval that the reassignment stranded. Without one there is nothing to
  // strand: the plan is simply assigned to someone who no longer holds the case.
  const hasApproval = !!plan?.approved_by;

  // Who owns what, from the registered documents themselves.
  const owned = (personId: string) =>
    workspace.scope.filter((doc) => doc.owner_id === personId).map((doc) => doc.title);
  const ownership = reviewers.map((person) => {
    const titles = owned(person.person_id);
    return titles.length
      ? `${person.display_name} owns the ${titles.join(" and the ")}`
      : `${person.display_name} owns no document`;
  });

  return (
    <div className="rr-stage">
      <h1>
        {movedFrom
          ? `Review authority moved from ${first(movedFrom)} to ${first(current?.display_name) ?? "someone else"}.`
          : `Review authority can move from ${first(current?.display_name) ?? "the reviewer"} to ${first(other?.display_name) ?? "another reviewer"}.`}
      </h1>

      <div className="rr-edges">
        {reviewers.map((person) => {
          const isCurrent = person.person_id === currentId;
          const gone = person.person_id === movedFromId && !isCurrent;
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
        Who may approve is set by the team’s review rota. Owning a document neither grants nor
        removes that right. This one edge decides whose approval counts; replacing it changes no
        candidate byte.
      </p>
      {ownership.length > 0 && <p className="rr-mono">{ownership.join(" · ")}.</p>}

      {recorded && (
        <div className="rr-history" aria-label="Recorded authority history">
          <div className="rr-history__label">Recorded history</div>
          <div className="rr-history__line">
            Plan v{recorded.version} was assigned to {movedFrom}. Plan v{plan?.version} is assigned
            to {plan?.assigned_reviewer_name ?? plan?.assigned_reviewer_id}, the reviewer the graph
            names now.
          </div>
          <div className="rr-history__meta">
            plan v{recorded.version} retired · {recorded.invalidation_reason}
          </div>
        </div>
      )}

      {!liveMoved && !done && other && (
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

      {liveMoved && (
        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          <div className="rr-alert-coral">
            <div className="rr-alert-coral__label">Assigned reviewer is no longer current</div>
            <div className="rr-alert-coral__line">
              {hasApproval
                ? `${assignedName}'s approval was recorded under an assignment that no longer holds.`
                : `This plan is assigned to ${assignedName}, who no longer holds review authority.`}
            </div>
            <div className="rr-alert-coral__meta">
              {hasApproval
                ? "Nothing is invalidated until a release or approval is attempted — the backend decides that, not this screen."
                : "No approval has been recorded on this plan, so there is none to invalidate."}{" "}
              Candidate bytes are unchanged · context rev {workspace.context_revision}
            </div>
          </div>
          {context.serverStep > 5 && (
            <button type="button" className="rr-primary" onClick={() => context.goTo(6)}>
              <span>
                {hasApproval
                  ? `Next: ${assignedName.split(" ")[0]} tries to issue`
                  : "Next: route a fresh review"}
              </span>
              <span>→</span>
            </button>
          )}
        </div>
      )}

      {recorded && context.serverStep > 5 && (
        <button type="button" className="rr-primary" onClick={() => context.goTo(6)}>
          <span>Next: the fresh approval</span>
          <span>→</span>
        </button>
      )}
    </div>
  );
}
