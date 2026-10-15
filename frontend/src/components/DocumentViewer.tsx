import { candidateUrl, editionUrl } from "../api";
import type { StageContext, ViewerTab } from "./stages/context";

/**
 * The report viewer.
 *
 * The chrome is the approved design; the page inside each sheet is the real
 * file the backend serves — the staged candidate bytes, or the bytes recorded
 * in a committed release. Nothing here re-typesets a report, because a
 * re-typeset report is not the edition.
 *
 * The before/after strip above each sheet is a comparison of the registered
 * cards, built from `assessment[].previous` and `.current`. It is labelled as
 * such and is never presented as part of the file.
 */
export default function DocumentViewer({
  tab,
  onTab,
  context,
  onClose,
}: {
  tab: ViewerTab;
  onTab: (tab: ViewerTab) => void;
  context: StageContext;
  onClose: () => void;
}) {
  const { workspace, plan } = context;
  const release = workspace.current_release;
  const candidates = plan?.candidates ?? {};
  const hasCandidates = Object.keys(candidates).length > 0 && plan?.status !== "ISSUED";

  const tabs: { id: ViewerTab; label: string }[] = [];
  if (release) tabs.push({ id: "current", label: `Version ${release.sequence} · current edition` });
  if (hasCandidates) tabs.push({ id: "candidate", label: "Candidate · corrected draft" });
  const active: ViewerTab = tabs.some((entry) => entry.id === tab) ? tab : (tabs[0]?.id ?? "current");

  const note =
    active === "candidate"
      ? `Staged draft for ${plan?.assigned_reviewer_name ?? plan?.assigned_reviewer_id ?? "the assigned reviewer"} · not yet issued`
      : release
        ? `Issued ${release.issued_at} · release ${release.release_id}`
        : "No edition has been issued yet";

  const sheets = workspace.scope.filter((doc) =>
    active === "candidate" ? doc.document_id in candidates : release?.document_ids.includes(doc.document_id),
  );

  return (
    <div className="rr-viewer" role="dialog" aria-modal="true" aria-label="Report viewer">
      <div className="rr-viewer__bar">
        <div className="rr-viewer__title">Reports</div>
        {tabs.length > 0 && (
          <div className="rr-viewer__tabs" role="tablist">
            {tabs.map((entry) => (
              <button
                key={entry.id}
                type="button"
                role="tab"
                aria-selected={entry.id === active}
                className="rr-viewer__tab"
                onClick={() => onTab(entry.id)}
              >
                {entry.label}
              </button>
            ))}
          </div>
        )}
        <span className="rr-viewer__note">{note}</span>
        <span className="rr-viewer__spacer" />
        <button type="button" className="rr-secondary" onClick={onClose}>
          Close · Esc
        </button>
      </div>

      <div className="rr-viewer__body">
        <div className="rr-viewer__grid">
          {sheets.map((doc) => {
            const assessment = workspace.assessment.find((entry) => entry.document_id === doc.document_id);
            const changed = !!assessment && (assessment.relation_changed || assessment.magnitude_changed);
            const sha =
              active === "candidate"
                ? candidates[doc.document_id]
                : release
                  ? (JSON.parse(release.artifacts) as Record<string, { sha256: string }>)[doc.document_id]?.sha256
                  : undefined;
            const src =
              active === "candidate" && plan
                ? candidateUrl(plan.plan_id, doc.document_id)
                : release
                  ? editionUrl(release.release_id, doc.document_id)
                  : "";

            return (
              <article className="rr-paper" key={`${active}-${doc.document_id}`}>
                <div className="rr-paper__head">
                  <div className="rr-paper__kicker">
                    <span>{doc.owner_name ? `Owner ${doc.owner_name}` : doc.document_id}</span>
                    <span>{active === "candidate" ? "Candidate · draft" : `Version ${release?.sequence ?? ""}`}</span>
                  </div>
                  <h2 className="rr-paper__title">{doc.title}</h2>
                  <div className="rr-paper__meta">
                    {sha ? `sha256 ${sha.slice(0, 16)}…` : "file hash unavailable"}
                  </div>
                  <div className="rr-paper__rule" />
                </div>

                {assessment && (
                  <div className={`rr-paper__diff${changed ? " rr-paper__diff--changed" : ""}`}>
                    <div className="rr-paper__diff-label">
                      Registered finding · {changed ? "corrected against the published edition" : "unchanged"}
                    </div>
                    {changed && assessment.previous?.text && (
                      <div className="rr-paper__diff-was">{assessment.previous.text}</div>
                    )}
                    <div className="rr-paper__diff-now">{assessment.current.text}</div>
                    <div className="rr-paper__diff-note">
                      Comparison of the registered card, from the workspace assessment. The sheet
                      below is the file itself.
                    </div>
                  </div>
                )}

                <iframe
                  className="rr-paper__frame"
                  title={`${doc.title} — ${active === "candidate" ? "candidate draft" : "issued edition"}`}
                  src={src}
                  sandbox=""
                />

                <div className="rr-paper__foot">
                  <span className="rr-paper__scope">
                    Editorial context in this report is not assessed by ResultRipple.
                  </span>
                  {active === "current" && release && (
                    <a
                      className="rr-paper__download"
                      href={editionUrl(release.release_id, doc.document_id, true)}
                      download
                    >
                      Download Version {release.sequence}
                    </a>
                  )}
                </div>
              </article>
            );
          })}
          {sheets.length === 0 && (
            <p className="rr-copy">Nothing to show here yet.</p>
          )}
        </div>
      </div>
    </div>
  );
}
