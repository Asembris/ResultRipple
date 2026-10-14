import { useState } from "react";

import { applyCorrection, stageReview } from "../api";
import type { Actor, CorrectionCase as Case, Workspace } from "../types";

/**
 * The correction surface: the dispatch source, the three batches it names, the
 * confirmation, and the typed intent frame shown beside the raw request.
 *
 * In this phase the intent frame is chosen deterministically by a person. The
 * runtime model will fill the same frame through typed tools in the next
 * branch; either way the engine owns the scope, the numbers and the wording.
 */
export default function CorrectionCase({
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
  const [busy, setBusy] = useState(false);
  if (!current) return null;

  const isAnalyst = actor?.demo_role === "analyst";
  const batchesById = new Map(state.evidence?.batches.map((b) => [b.batch_id, b]) ?? []);

  const confirm = async () => {
    setBusy(true);
    try {
      await applyCorrection(current.case_id, current.changed_batch_ids, state.context_revision);
      await onChange();
    } catch (error) {
      onError(error);
    } finally {
      setBusy(false);
    }
  };

  const stage = async () => {
    setBusy(true);
    try {
      await stageReview(current.case_id, {
        raw_request: current.request_text,
        // The request asks to keep an unsupported cheaper claim, so the frame
        // records that goal and flags the corrected alternative explicitly.
        goal: "RETAIN_CHEAPER_CLAIM",
        disposition: "RETURN_FOR_REVIEW",
        alternative_flag: true,
        note: "The requested cost endorsement is contradicted by current evidence. Corrected facts are proposed and the South proposal is returned to its reviewer.",
        idempotency_key: `${current.case_id}-stage`,
      });
      await onChange();
    } catch (error) {
      onError(error);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="panel" aria-labelledby="case-heading">
      <h2 id="case-heading">Correction case</h2>
      <p className="panel__lead">
        {current.case_id} &middot; status <strong>{current.status.replace(/_/g, " ").toLowerCase()}</strong>
      </p>

      <div className="card">
        <h3>Dispatch source {current.source_ref}</h3>
        <blockquote className="source-note">{current.source_note}</blockquote>
        <p className="meta">SHA-256 {current.source_note_sha.slice(0, 16)}&hellip;</p>
        <table className="batches">
          <caption>Batches this note reassigns</caption>
          <thead>
            <tr>
              <th scope="col">Batch</th>
              <th scope="col">Cost (cents)</th>
              <th scope="col">Effective lane</th>
            </tr>
          </thead>
          <tbody>
            {current.changed_batch_ids.map((id) => (
              <tr key={id}>
                <th scope="row">{id}</th>
                <td>{batchesById.get(id)?.cost_cents ?? "—"}</td>
                <td>{batchesById.get(id)?.lane_id.replace("lane-", "") ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {current.status === "CORRECTION_PENDING" ? (
          <button type="button" onClick={confirm} disabled={!isAnalyst || busy}>
            Confirm correction against this source
          </button>
        ) : (
          <p className="flag flag--ok">
            Applied by {current.applied_by} &middot; raw costs and the dataset hash unchanged
          </p>
        )}
        {!isAnalyst && current.status === "CORRECTION_PENDING" && (
          <p className="meta">Sign in as the analyst to confirm this correction.</p>
        )}
      </div>

      {current.status !== "CORRECTION_PENDING" && (
        <div className="card">
          <h3>Request and interpretation</h3>
          <p className="published">
            <span className="label">Raw request</span>
            {current.request_text}
          </p>
          <ul className="intent">
            <li>
              <span className="label">Requested</span> keep the cheaper claim
            </li>
            <li>
              <span className="label">Evidence</span>{" "}
              {state.comparison
                ? `${state.comparison.right.lane_name} costs more than ${state.comparison.left.lane_name}`
                : "held"}
            </li>
            <li>
              <span className="label">Proposed alternative</span> correct the facts and return the
              proposal for review
            </li>
          </ul>
          {current.plans.length === 0 ? (
            <button type="button" onClick={stage} disabled={!isAnalyst || busy}>
              Stage the review
            </button>
          ) : (
            <p className="meta">
              {current.plans.length} plan version{current.plans.length === 1 ? "" : "s"} staged.
            </p>
          )}
          <p className="unassessed">
            The interpretation above is a typed frame, not consent. A human reviewer must
            acknowledge the alternative before anything is approved.
          </p>
        </div>
      )}
    </section>
  );
}

export type { Case };
