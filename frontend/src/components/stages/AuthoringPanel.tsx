import { useState } from "react";

import {
  approvePlan,
  candidateUrl,
  createFinding,
  insertLinkedFinding,
  issueRelease,
  recordDecisionBasis,
  stageReview,
} from "../../api";
import type { PlanSummary } from "../../types";
import {
  initialPublicationCase,
  latestPlanSummary,
  money,
  planRetired,
  stagingAttempt,
} from "../../workflow";
import type { StageContext } from "./context";

/**
 * Step 1 on an authoring-start workspace — register once, reuse, record the
 * basis, then issue the initial publication.
 *
 * Every fact, sentence, style and status shown here is a server response. The
 * only local state is which confirmation boxes the person has ticked, and the
 * server refuses an unconfirmed binding whatever the page sends.
 */
export default function AuthoringPanel({ context }: { context: StageContext }) {
  const { workspace, actor, busy } = context;
  const comparison = workspace.comparison;
  const findings = workspace.findings ?? [];
  const finding = findings.find((entry) =>
    comparison ? entry.comparison_ids.includes(comparison.comparison_id) : false,
  );
  // Any session sees the action; the server decides who may take it.
  const signedIn = actor !== null;
  const decision = workspace.decision;
  const decisionDocument = workspace.scope.find((doc) => doc.has_decision_block);
  const placement = (documentId: string) =>
    finding?.occurrences.find((occ) => occ.document_id === documentId) ?? null;
  const basisRecorded = !!finding && decision?.basis_claim_id === finding.claim_id;
  const placedEverywhere =
    !!finding && workspace.scope.every((doc) => placement(doc.document_id) !== null);
  const authored = placedEverywhere && basisRecorded;

  const [confirmKey, setConfirmKey] = useState<string | null>(null);
  const confirmed = (key: string) => confirmKey === key;
  const toggle = (key: string) => setConfirmKey(confirmed(key) ? null : key);
  const [choosing, setChoosing] = useState(false);

  const nameOf = (personId: string | null) =>
    workspace.people.find((person) => person.person_id === personId)?.display_name ?? personId;

  return (
    <div className="rr-stage rr-stage--wide">
      <h1 className="rr-h1--desk">Register the finding once, then reuse it.</h1>
      <p className="rr-lead">
        Nothing has been issued yet. A finding becomes registered only when the analyst confirms
        the comparison behind it, and each report uses it only where it is inserted.
      </p>

      {workspace.hold && (
        <div className="rr-alert-coral">
          <div className="rr-alert-coral__label">Evidence held</div>
          <div className="rr-alert-coral__line">{workspace.hold.code}</div>
          <div className="rr-alert-coral__meta">{workspace.hold.detail}</div>
        </div>
      )}

      {comparison && (
        <section className="rr-card" aria-label="Comparison">
          <div className="rr-card__label">
            Comparison · {comparison.metric_key} · {comparison.comparison_id}
          </div>
          <div className="rr-list__sub">
            {comparison.dataset_title ?? comparison.dataset_id}
            {comparison.dataset_sha ? ` · sha256 ${comparison.dataset_sha.slice(0, 12)}…` : ""}
          </div>
          <table className="rr-table">
            <thead>
              <tr>
                <th scope="col">Side</th>
                <th scope="col" className="rr-num">Batches</th>
                <th scope="col" className="rr-num">Mean per parcel</th>
              </tr>
            </thead>
            <tbody>
              {[comparison.left, comparison.right].map((side) => (
                <tr key={side.lane_id}>
                  <th scope="row">{side.lane_name}</th>
                  <td>{side.batch_count}</td>
                  <td>{money(side.mean_display_cents)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="rr-mono">
            unit {comparison.unit ?? "—"} · minimum {comparison.min_n} batches per side · owner{" "}
            {comparison.owner_name ?? "unknown"}
          </div>
          {comparison.sentence && <div className="rr-card__sentence">{comparison.sentence}</div>}

          {finding ? (
            <div className="rr-list__sub">
              Registered finding · {finding.title} · approved by {nameOf(finding.approved_by)}
            </div>
          ) : signedIn && !choosing ? (
            <button type="button" className="rr-primary" onClick={() => setChoosing(true)}>
              <span>Use this finding</span>
              <span>→</span>
            </button>
          ) : signedIn ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <label className={`rr-ack${confirmed("binding") ? " rr-ack--checked" : ""}`}>
                <input
                  type="checkbox"
                  checked={confirmed("binding")}
                  onChange={() => toggle("binding")}
                />
                <span>This is the intended comparison.</span>
              </label>
              <button
                type="button"
                className="rr-primary"
                disabled={busy}
                onClick={() =>
                  void context.commit(() =>
                    createFinding(
                      comparison.comparison_id,
                      workspace.context_revision,
                      confirmed("binding"),
                    ),
                  )
                }
              >
                <span>{busy ? "Registering…" : "Register finding"}</span>
                <span>✓</span>
              </button>
            </div>
          ) : (
            <p className="rr-copy">Sign in as the analyst above to register this finding.</p>
          )}
        </section>
      )}

      <section className="rr-card" aria-label="Linked uses">
        <div className="rr-card__label">Linked uses</div>
        <div className="rr-list">
          {workspace.scope.map((doc) => {
            const placed = placement(doc.document_id);
            return (
              <div className="rr-list__row" key={doc.document_id}>
                <div>
                  <div className="rr-list__title">{doc.title}</div>
                  <div className="rr-list__sub">
                    owner {doc.owner_name ?? "unknown"} · {doc.approved_card_style ?? "no approved"}{" "}
                    card
                  </div>
                </div>
                {placed ? (
                  <span className="rr-list__state rr-state--ok">linked · {placed.card_style}</span>
                ) : finding && signedIn && doc.approved_card_style ? (
                  <button
                    type="button"
                    className="rr-secondary"
                    disabled={busy}
                    aria-label={`Insert linked finding into ${doc.title}`}
                    onClick={() =>
                      void context.commit(() =>
                        insertLinkedFinding(
                          doc.document_id,
                          finding.claim_id,
                          doc.approved_card_style as string,
                          workspace.context_revision,
                        ),
                      )
                    }
                  >
                    Insert linked finding
                  </button>
                ) : (
                  <span className="rr-list__state">not linked</span>
                )}
              </div>
            );
          })}

          {decision && (
            <div className="rr-list__row">
              <div>
                <div className="rr-list__title">{decision.title}</div>
                <div className="rr-list__sub">
                  {decision.status.replace(/_/g, " ").toLowerCase()} · basis{" "}
                  {decision.basis_claim_id ?? "not recorded"}
                </div>
              </div>
              {basisRecorded ? (
                <span className="rr-list__state rr-state--ok">basis recorded</span>
              ) : (
                <span className="rr-list__state">no basis</span>
              )}
            </div>
          )}
        </div>

        {finding &&
          decision &&
          !basisRecorded &&
          decisionDocument &&
          placement(decisionDocument.document_id) &&
          signedIn && (
            <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 16 }}>
              <label className={`rr-ack${confirmed("basis") ? " rr-ack--checked" : ""}`}>
                <input type="checkbox" checked={confirmed("basis")} onChange={() => toggle("basis")} />
                <span>This finding is a basis for the {decision.title}.</span>
              </label>
              <button
                type="button"
                className="rr-primary"
                disabled={busy}
                onClick={() =>
                  void context.commit(() =>
                    recordDecisionBasis(
                      decision.decision_id,
                      finding.claim_id,
                      workspace.context_revision,
                      confirmed("basis"),
                    ),
                  )
                }
              >
                <span>Record as decision basis</span>
                <span>✓</span>
              </button>
            </div>
          )}
      </section>

      {authored && <InitialPublication context={context} nameOf={nameOf} />}

      <p className="rr-scope">{workspace.verification_scope}</p>
    </div>
  );
}

function InitialPublication({
  context,
  nameOf,
}: {
  context: StageContext;
  nameOf: (personId: string | null) => string | null;
}) {
  const { workspace, actor, busy } = context;
  const kase = initialPublicationCase(workspace);
  if (!kase) return null;
  const plan: PlanSummary | null = latestPlanSummary(kase);
  // Any session sees the action; the server decides who may take it.
  const signedIn = actor !== null;

  return (
    <section className="rr-card" aria-label="Initial publication">
      <div className="rr-card__label">Initial publication</div>
      <p className="rr-copy">
        The first edition of both reports. It is staged, approved and issued through the same
        review path as any later revision; it is not a correction.
      </p>

      {plan?.status === "INVALIDATED" && (
        <div className="rr-alert-coral">
          <div className="rr-alert-coral__label">Plan v{plan.version} invalidated</div>
          <div className="rr-alert-coral__meta">
            {plan.invalidation_reason}: the workspace changed after this plan was staged. Nothing
            was issued and its approval does not carry over. Prepare a new version for a fresh
            review.
          </div>
        </div>
      )}

      {(!plan || planRetired(plan)) &&
        (signedIn ? (
          <button
            type="button"
            className="rr-primary"
            disabled={busy}
            onClick={() =>
              void context.commit(() =>
                stageReview(kase.case_id, {
                  raw_request: kase.request_text,
                  goal: "CORRECT_FACTS",
                  disposition: "NO_CHANGE",
                  alternative_flag: false,
                  note: "",
                  idempotency_key: `initial-publication-rev-${workspace.context_revision}-${stagingAttempt(kase)}`,
                }),
              )
            }
          >
            <span>{busy ? "Rendering…" : "Prepare initial publication"}</span>
            <span>→</span>
          </button>
        ) : (
          <p className="rr-copy">Sign in as the analyst above to prepare the first edition.</p>
        ))}

      {plan && !planRetired(plan) && (
        <>
          <div className="rr-mono">
            plan v{plan.version} · {plan.status.replace(/_/g, " ").toLowerCase()} · reviewer{" "}
            {nameOf(plan.assigned_reviewer_id)}
          </div>
          <div className="rr-list">
            {workspace.scope.map((doc) => (
              <div className="rr-list__row" key={doc.document_id}>
                <div className="rr-list__title">{doc.title}</div>
                <a
                  className="rr-secondary"
                  href={candidateUrl(plan.plan_id, doc.document_id)}
                  target="_blank"
                  rel="noreferrer"
                >
                  Preview draft
                </a>
              </div>
            ))}
          </div>

          {plan.status === "AWAITING_REVIEW" && actor && (
            <button
              type="button"
              className="rr-primary"
              disabled={busy}
              onClick={() => void context.commit(() => approvePlan(plan, false))}
            >
              <span>Approve revision as {actor.display_name}</span>
              <span>✓</span>
            </button>
          )}
          {plan.status === "APPROVED" && actor && (
            <button
              type="button"
              className="rr-primary"
              disabled={busy}
              onClick={() =>
                void context.commit(() => issueRelease(plan.plan_id, `issue-${plan.plan_id}`))
              }
            >
              <span>{busy ? "Issuing…" : `Issue editions as ${actor.display_name}`}</span>
              <span>→</span>
            </button>
          )}
          {!actor && <p className="rr-copy">Sign in above as the assigned reviewer to continue.</p>}
          <p className="rr-mono">
            Only {nameOf(plan.assigned_reviewer_id) ?? "the assigned reviewer"} may approve and
            issue. The server decides.
          </p>
        </>
      )}
    </section>
  );
}
