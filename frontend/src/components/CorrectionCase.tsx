import { useState } from "react";

import { applyCorrection, stageReview } from "../api";
import type { Actor, CorrectionCase as Case, Workspace } from "../types";

/**
 * The correction surface: the dispatch source, the three batches it names, and
 * the analyst's confirmation.
 *
 * Staging is normally driven by the real agent run below. The manual staging
 * here remains as an honestly labelled fallback for when inference is
 * unavailable: a person chooses the typed frame instead of the model. Either
 * way the engine owns the scope, the numbers and the card wording.
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
          <h3>Manual correction workflow &mdash; fallback without the agent</h3>
          <p className="meta">
            The agent below normally interprets the request and stages the review. This button
            runs the same deterministic staging with a human-chosen typed frame, for when
            inference is unavailable. It is a manual fallback, not an agent demonstration.
          </p>
          <p className="published">
            <span className="label">Recorded request on this case</span>
            {current.request_text}
          </p>
          {current.clarification_question && (
            <p className="flag flag--held">
              Waiting on one question: {current.clarification_question}
            </p>
          )}
          {current.plans.length === 0 ? (
            <button type="button" className="secondary" onClick={stage} disabled={!isAnalyst || busy}>
              Stage manually instead
            </button>
          ) : (
            <p className="meta">
              {current.plans.length} plan version{current.plans.length === 1 ? "" : "s"} staged.
            </p>
          )}
          <p className="unassessed">
            A typed frame is not consent. A human reviewer must acknowledge a proposed
            alternative before anything is approved.
          </p>
        </div>
      )}
    </section>
  );
}

export type { Case };
