import { useEffect, useState } from "react";

import { editionUrl, receiptUrl } from "../../api";
import type { Receipt } from "../../types";
import { RELATION_PHRASE, money } from "../../workflow";
import type { StageContext } from "./context";

/**
 * Step 7 — what was issued.
 *
 * Every card, hash and ledger row is read from the committed release and its
 * receipt. Downloads are plain links to the allowlisted edition endpoint; no
 * file is generated in the browser.
 */
export default function EditionsStage({ context }: { context: StageContext }) {
  const { workspace, plan } = context;
  const release = workspace.current_release;
  const [receipt, setReceipt] = useState<Receipt | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!release) {
      setReceipt(null);
      return;
    }
    fetch(receiptUrl(release.release_id), { credentials: "include", headers: { accept: "application/json" } })
      .then((response) => (response.ok ? response.json() : null))
      .then((value: Receipt | null) => {
        if (!cancelled) setReceipt(value);
      })
      .catch(() => {
        if (!cancelled) setReceipt(null);
      });
    return () => {
      cancelled = true;
    };
  }, [release?.release_id]);

  if (!release) return null;

  const artifacts = JSON.parse(release.artifacts) as Record<
    string,
    { path: string; sha256: string; title: string }
  >;
  const issuedBy =
    workspace.people.find((person) => person.person_id === receipt?.issued_by)?.display_name ??
    receipt?.issued_by ??
    "the reviewer";
  const approvedBy =
    workspace.people.find((person) => person.person_id === receipt?.approved_by)?.display_name ??
    receipt?.approved_by ??
    null;

  const comparison = workspace.comparison;
  // What this edition changed, as the release itself recorded it. After issue
  // the live assessment compares the new editions with current evidence, so it
  // no longer holds the Version 1 wording.
  const snapshots = JSON.parse(release.occurrence_snapshots) as {
    document_id: string;
    previous: { text?: string; relation?: string; magnitude_cents?: number };
    current: { text?: string; relation?: string; magnitude_cents?: number };
    relation_changed: boolean;
  }[];
  const flipped = snapshots.find((entry) => entry.previous?.relation);
  const ledger: { k: string; v: string }[] = [];
  if (comparison) {
    ledger.push({
      k: `${comparison.right.lane_name} mean`,
      v: `${money(comparison.right.mean_display_cents)} per parcel over ${comparison.right.batch_count} batches`,
    });
    ledger.push({
      k: `${comparison.left.lane_name} mean`,
      v: `${money(comparison.left.mean_display_cents)} per parcel over ${comparison.left.batch_count} batches`,
    });
  }
  if (flipped?.previous?.relation && flipped.current?.relation) {
    ledger.push({
      k: "Finding",
      v: `${money(flipped.previous.magnitude_cents ?? 0)} ${RELATION_PHRASE[flipped.previous.relation] ?? ""} → ${money(flipped.current.magnitude_cents ?? 0)} ${RELATION_PHRASE[flipped.current.relation] ?? ""}`,
    });
  }
  if (workspace.decision) {
    ledger.push({
      k: "Proposal",
      v: workspace.decision.status.replace(/_/g, " ").toLowerCase(),
    });
  }
  if (receipt?.authority_at_issue?.reviewer_name) {
    ledger.push({ k: "Authority at issue", v: receipt.authority_at_issue.reviewer_name });
  }
  if (approvedBy) {
    ledger.push({
      k: "Approval",
      v: `${approvedBy} · plan v${receipt?.plan_version ?? plan?.version ?? ""}${
        receipt?.acknowledged_alternative ? " · alternative acknowledged" : ""
      }`,
    });
  }
  if (receipt?.raw_request) {
    ledger.push({ k: "Raw request", v: receipt.raw_request });
  }
  if (receipt?.interpreted_goal) {
    ledger.push({
      k: "Interpreted goal",
      v: `${receipt.interpreted_goal}${receipt.alternative_proposed ? " · alternative proposed" : ""}`,
    });
  }
  if (receipt?.dataset_sha) {
    ledger.push({ k: "Raw measurements", v: `unchanged · dataset sha ${receipt.dataset_sha.slice(0, 16)}…` });
  }
  if (receipt?.membership_sha) {
    ledger.push({ k: "Membership snapshot", v: `${receipt.membership_sha.slice(0, 16)}…` });
  }

  return (
    <div className="rr-stage rr-stage--wide">
      <div>
        <div className="rr-release__kicker">
          Release {release.sequence} · issued by {issuedBy}
        </div>
        <h1 className="rr-h1--final">
          {release.document_ids.length} corrected edition
          {release.document_ids.length === 1 ? " is" : "s are"} out.
        </h1>
      </div>

      <div className="rr-editions">
        {workspace.scope
          .filter((doc) => doc.document_id in artifacts)
          .map((doc) => {
            const assessment = workspace.assessment.find(
              (entry) => entry.document_id === doc.document_id,
            );
            return (
              <div className="rr-edition" key={doc.document_id}>
                <button
                  type="button"
                  className="rr-edition__face"
                  aria-label={`Open ${doc.title}`}
                  onClick={() => context.openViewer("current")}
                >
                  <span className="rr-edition__kicker">Version {release.sequence} · edition</span>
                  <span className="rr-edition__title">{doc.title}</span>
                  <span className="rr-edition__sentence">
                    {snapshots.find((entry) => entry.document_id === doc.document_id)?.current.text ??
                      assessment?.current.text ??
                      ""}
                  </span>
                </button>
                <div className="rr-edition__foot">
                  <span className="rr-edition__owner">
                    {doc.owner_name} · sha {artifacts[doc.document_id].sha256.slice(0, 12)}
                  </span>
                  <a
                    className="rr-download"
                    href={editionUrl(release.release_id, doc.document_id, true)}
                    download
                  >
                    Download
                  </a>
                </div>
              </div>
            );
          })}
      </div>

      <dl className="rr-ledger">
        {ledger.map((row) => (
          <div className="rr-ledger__row" key={row.k}>
            <dt>{row.k}</dt>
            <dd>{row.v}</dd>
          </div>
        ))}
      </dl>

      <p className="rr-scope">{receipt?.verification_scope ?? workspace.verification_scope}</p>

      <div className="rr-buttons">
        <a
          className="rr-secondary"
          href={receiptUrl(release.release_id)}
          target="_blank"
          rel="noreferrer"
        >
          Open release receipt
        </a>
        <button type="button" className="rr-secondary" onClick={() => context.openViewer("current")}>
          Read both editions
        </button>
      </div>

      {workspace.releases.length > 1 && (
        <div>
          <div className="rr-micro" style={{ marginBottom: 6 }}>
            Previous versions
          </div>
          <dl className="rr-ledger">
            {[...workspace.releases]
              .sort((a, b) => b.sequence - a.sequence)
              .map((entry) => (
                <div className="rr-ledger__row" key={entry.release_id}>
                  <dt>Version {entry.sequence}</dt>
                  <dd>
                    {entry.issued_at} ·{" "}
                    {entry.is_current ? (
                      <span style={{ color: "var(--rr-sage)" }}>current</span>
                    ) : (
                      <span style={{ color: "var(--rr-ink-3)" }}>superseded, still readable</span>
                    )}{" "}
                    ·{" "}
                    <a href={receiptUrl(entry.release_id)} target="_blank" rel="noreferrer">
                      receipt
                    </a>
                  </dd>
                </div>
              ))}
          </dl>
        </div>
      )}
    </div>
  );
}
