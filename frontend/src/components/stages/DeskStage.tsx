import { authoringOpen, contradicted } from "../../workflow";
import AuthoringPanel from "./AuthoringPanel";
import type { StageContext } from "./context";

/**
 * Step 1 — the publishing desk.
 *
 * The finding sentence shown here is the one the current editions actually
 * publish (`assessment[].previous.text`), not a recomputed one. Before an
 * authoring-start workspace has its first edition, the desk is the authoring
 * panel instead.
 */
export default function DeskStage({ context }: { context: StageContext }) {
  const { workspace, kase } = context;
  // An authoring-start workspace has nothing published to describe yet.
  if (authoringOpen(workspace)) return <AuthoringPanel context={context} />;

  const published =
    workspace.assessment[0]?.previous?.text ?? workspace.assessment[0]?.current.text ?? null;
  const release = workspace.current_release;
  const outOfDate = workspace.assessment.filter(contradicted);
  const correctionPending = !!kase && kase.status === "CORRECTION_PENDING";

  return (
    <div className="rr-stage rr-stage--wide">
      <h1 className="rr-h1--desk">One finding, two reports, one pending decision.</h1>
      <p className="rr-lead">
        {release ? `Version ${release.sequence} is current.` : "Nothing has been issued yet."} Both
        reports publish the same registered finding, and the {workspace.decision?.title ?? "proposal"}{" "}
        records that finding as its basis.
      </p>

      <div className="rr-card">
        <div className="rr-card__label">
          Registered finding · as published{release ? ` in Version ${release.sequence}` : ""}
        </div>
        {published && <div className="rr-card__sentence">{published}</div>}

        <div className="rr-list">
          {workspace.scope.map((doc) => {
            const assessment = workspace.assessment.find(
              (entry) => entry.document_id === doc.document_id,
            );
            const stale = contradicted(assessment);
            const style = doc.occurrences[0]?.card_style;
            return (
              <div className="rr-list__row" key={doc.document_id}>
                <div>
                  <div className="rr-list__title">{doc.title}</div>
                  <div className="rr-list__sub">
                    owner {doc.owner_name ?? "unknown"}
                    {style ? ` · ${style} card` : ""}
                  </div>
                </div>
                <span className={`rr-list__state ${stale ? "rr-state--stale" : "rr-state--ok"}`}>
                  {stale ? "out of date" : release ? `V${release.sequence} current` : "unpublished"}
                </span>
              </div>
            );
          })}

          {workspace.decision && (
            <div className="rr-list__row">
              <div>
                <div className="rr-list__title">{workspace.decision.title}</div>
                <div className="rr-list__sub">
                  {workspace.decision.team_name ?? "no owning team"} · reviewer{" "}
                  {workspace.decision.current_reviewer_name ?? "none resolved"}
                  {workspace.decision.current_reviewer_name ? " ★" : ""}
                </div>
              </div>
              <span className="rr-list__state rr-state--current">
                {workspace.decision.status.replace(/_/g, " ").toLowerCase()}
              </span>
            </div>
          )}
        </div>

        {release && (
          <button
            type="button"
            className="rr-secondary"
            style={{ marginTop: 16 }}
            onClick={() => context.openViewer("current")}
          >
            Read both reports
          </button>
        )}
      </div>

      {workspace.hold && (
        <div className="rr-alert-coral">
          <div className="rr-alert-coral__label">Evidence held</div>
          <div className="rr-alert-coral__line">{workspace.hold.code}</div>
          <div className="rr-alert-coral__meta">{workspace.hold.detail}</div>
        </div>
      )}

      {correctionPending && kase && (
        <div className="rr-alert-amber">
          <div className="rr-alert-amber__head">
            <span className="rr-dot" />
            Incoming dispatch correction
          </div>
          <div className="rr-alert-amber__line">
            {kase.source_ref} reassigns {kase.changed_batch_ids.length} batches.
          </div>
        </div>
      )}

      {outOfDate.length > 0 && (
        <div className="rr-alert-coral">
          <div className="rr-alert-coral__label">Review needed</div>
          <div className="rr-alert-coral__line">
            {outOfDate.length} registered {outOfDate.length === 1 ? "use is" : "uses are"} contradicted by
            current evidence.
          </div>
        </div>
      )}

      {context.serverStep > 1 && (
        <button type="button" className="rr-primary" onClick={() => context.goTo(2)}>
          <span>{correctionPending ? "Review the correction" : "See what it changes"}</span>
          <span>→</span>
        </button>
      )}

      <p className="rr-scope">{workspace.verification_scope}</p>
    </div>
  );
}
