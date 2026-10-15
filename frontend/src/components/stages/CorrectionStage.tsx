import { applyCorrection } from "../../api";
import { documentNodeKey } from "../../graph/stageFromWorkspace";
import { RELATION_PHRASE, contradicted, money } from "../../workflow";
import type { StageContext } from "./context";

/**
 * Step 2 — the dispatch source, then what it changed.
 *
 * Before the correction: the note, its hash, and the batches it names, from the
 * case record. After it: the reversal, from the comparison the server now
 * returns and the assertions the current editions actually publish.
 */
export default function CorrectionStage({ context }: { context: StageContext }) {
  const { workspace, kase, actor, busy } = context;
  if (!kase) return null;

  const batches = workspace.evidence?.batches ?? [];
  const pending = kase.status === "CORRECTION_PENDING";
  const laneName = (laneId: string) =>
    workspace.comparison?.left.lane_id === laneId
      ? workspace.comparison.left.lane_name
      : workspace.comparison?.right.lane_id === laneId
        ? workspace.comparison.right.lane_name
        : laneId.replace(/^lane-/, "").replace(/^./, (c) => c.toUpperCase());

  const isAnalyst = actor?.demo_role === "analyst";

  if (pending) {
    return (
      <div className="rr-stage">
        <h1>{kase.changed_batch_ids.length} batches were logged against the wrong lane.</h1>
        <blockquote className="rr-quote">{kase.source_note}</blockquote>
        <div className="rr-mono">
          source {kase.source_ref} · sha256 {kase.source_note_sha.slice(0, 16)}…
        </div>

        <table className="rr-table">
          <thead>
            <tr>
              <th scope="col">Batch</th>
              <th scope="col" className="rr-num">Cost</th>
              <th scope="col" className="rr-num">Lane now</th>
              <th scope="col" className="rr-num">After</th>
            </tr>
          </thead>
          <tbody>
            {kase.changed_batch_ids.map((id) => {
              const batch = batches.find((entry) => entry.batch_id === id);
              return (
                <tr key={id}>
                  <th scope="row">{id}</th>
                  <td>{batch ? `${batch.cost_cents}¢` : "—"}</td>
                  <td className="rr-was">{laneName(kase.from_lane_id)}</td>
                  <td>{laneName(kase.to_lane_id)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>

        <p className="rr-copy">
          Raw costs stay exactly as recorded. Only lane membership changes, which moves these runs
          out of the {workspace.comparison?.left.lane_name}–{workspace.comparison?.right.lane_name}{" "}
          comparison.
        </p>

        {isAnalyst ? (
          <button
            type="button"
            className="rr-primary"
            disabled={busy}
            onClick={() =>
              void context.commit(() =>
                applyCorrection(kase.case_id, kase.changed_batch_ids, workspace.context_revision),
              )
            }
          >
            <span>{busy ? "Committing…" : "Confirm correction against this source"}</span>
            <span>→</span>
          </button>
        ) : (
          <p className="rr-copy">
            Only the analyst confirms an evidence correction. Sign in as the analyst above to
            continue.
          </p>
        )}
      </div>
    );
  }

  return <Consequences context={context} />;
}

function Consequences({ context }: { context: StageContext }) {
  const { workspace, kase, previousComparison } = context;
  const comparison = workspace.comparison;
  const right = comparison?.right;
  const wasMean =
    previousComparison && right && previousComparison.right.mean_display_cents !== right.mean_display_cents
      ? previousComparison.right.mean_display_cents
      : null;

  const outdated = workspace.assessment.filter(contradicted);
  const flip = outdated[0];
  const wasPhrase =
    flip?.previous && typeof flip.previous.magnitude_cents === "number" && flip.previous.relation
      ? `${money(flip.previous.magnitude_cents)} ${RELATION_PHRASE[flip.previous.relation] ?? ""}`.trim()
      : null;
  const nowPhrase =
    comparison && comparison.relation !== "WITHHELD"
      ? `${money(comparison.magnitude_cents)} ${RELATION_PHRASE[comparison.relation] ?? ""}`.trim()
      : (comparison?.hold_reason ?? "withheld");

  return (
    <div className="rr-stage rr-stage--wide">
      <div>
        <div className="rr-micro">
          {right?.lane_name ?? "Subject lane"} mean cost per parcel
        </div>
        <div className="rr-reversal">
          {wasMean !== null && (
            <>
              <span className="rr-reversal__was">{money(wasMean)}</span>
              <span className="rr-reversal__arrow">→</span>
            </>
          )}
          <span style={{ color: "var(--rr-coral)" }}>{right ? money(right.mean_display_cents) : "—"}</span>
        </div>
        <div className="rr-reversal__sub">
          {comparison?.left.lane_name} {comparison ? money(comparison.left.mean_display_cents) : ""} ·
          unchanged
          {wasMean === null && " · this session did not observe the earlier value"}
        </div>
      </div>

      <div className="rr-card rr-card--tight">
        <div className="rr-flip">
          {wasPhrase && (
            <>
              <span className="rr-flip__old">
                {wasPhrase}
                <span className="rr-flip__strike" />
              </span>
              <span className="rr-flip__arrow">→</span>
            </>
          )}
          <span className="rr-flip__new" style={{ color: "var(--rr-coral)" }}>
            {nowPhrase}
          </span>
        </div>
        <div className="rr-mono" style={{ marginTop: 8 }}>
          Raw measurements unchanged · dataset hash {workspace.evidence?.dataset_sha.slice(0, 12)}… ·{" "}
          {kase?.changed_batch_ids.length ?? 0} memberships changed
        </div>
      </div>

      <div>
        <div className="rr-micro" style={{ marginBottom: 6 }}>
          What the graph says this changes
        </div>
        {outdated.map((entry) => {
          const doc = workspace.scope.find((item) => item.document_id === entry.document_id);
          const node = documentNodeKey(workspace, entry.document_id);
          return (
            <button
              type="button"
              className="rr-impact"
              key={entry.occurrence_id}
              onClick={() => node && context.focusNode(node)}
            >
              <span className="rr-impact__dot" />
              <span>
                <span className="rr-impact__title">{doc?.title ?? entry.document_id}</span>
                <span className="rr-impact__sub">
                  published “{entry.previous?.text ?? "—"}” · owner {doc?.owner_name ?? "unknown"}
                </span>
              </span>
              <span className="rr-impact__tag">
                {entry.relation_changed ? "DIRECTION CHANGED" : "MAGNITUDE CHANGED"}
              </span>
            </button>
          );
        })}

        {workspace.decision && outdated.length > 0 && (
          <button type="button" className="rr-impact" onClick={() => context.focusNode("decision")}>
            <span className="rr-impact__dot" />
            <span>
              <span className="rr-impact__title">{workspace.decision.title}</span>
              <span className="rr-impact__sub">
                recorded basis {workspace.decision.basis_claim_id ?? "missing"} · reviewer{" "}
                {workspace.decision.current_reviewer_name ?? "none resolved"}
              </span>
            </span>
            <span className="rr-impact__tag">BASIS CONTRADICTED</span>
          </button>
        )}

        {outdated.length === 0 && (
          <p className="rr-copy">
            Every registered use still matches current evidence.
          </p>
        )}
      </div>

      {context.serverStep > 2 && (
        <button type="button" className="rr-primary" onClick={() => context.goTo(3)}>
          <span>Ask the agent to prepare the review</span>
          <span>→</span>
        </button>
      )}
    </div>
  );
}
