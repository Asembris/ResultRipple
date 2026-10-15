import { candidateUrl, editionUrl } from "../api";
import PaperFrame, { usePaperBytes } from "./PaperFrame";
import type { StageContext, ViewerTab } from "./stages/context";
import type { Assessment, DocumentScope, Release } from "../types";

/**
 * The report viewer.
 *
 * The chrome is the approved design; the page inside each sheet is the real
 * file the backend serves — the staged candidate bytes, or the bytes recorded
 * in a committed release — with the hash the server reported for them.
 *
 * The before/after strip above each sheet compares the registered card using
 * `assessment[].previous` and `.current`. It is labelled as a comparison and is
 * never presented as part of the file.
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
    active === "candidate"
      ? doc.document_id in candidates
      : release?.document_ids.includes(doc.document_id),
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
          {sheets.map((doc) => (
            <Sheet
              key={`${active}-${doc.document_id}`}
              doc={doc}
              assessment={workspace.assessment.find((entry) => entry.document_id === doc.document_id) ?? null}
              release={release}
              mode={active}
              url={
                active === "candidate" && plan
                  ? candidateUrl(plan.plan_id, doc.document_id)
                  : release
                    ? editionUrl(release.release_id, doc.document_id)
                    : null
              }
              downloadUrl={
                active === "current" && release
                  ? editionUrl(release.release_id, doc.document_id, true)
                  : null
              }
            />
          ))}
          {sheets.length === 0 && <p className="rr-copy">Nothing to show here yet.</p>}
        </div>
      </div>
    </div>
  );
}

function Sheet({
  doc,
  assessment,
  release,
  mode,
  url,
  downloadUrl,
}: {
  doc: DocumentScope;
  assessment: Assessment | null;
  release: Release | null;
  mode: ViewerTab;
  url: string | null;
  downloadUrl: string | null;
}) {
  const bytes = usePaperBytes(url);
  const changed = !!assessment && (assessment.relation_changed || assessment.magnitude_changed);

  return (
    <article className="rr-paper">
      <div className="rr-paper__head">
        <div className="rr-paper__kicker">
          <span>{doc.owner_name ? `Owner ${doc.owner_name}` : doc.document_id}</span>
          <span>
            {mode === "candidate" ? "Candidate · draft" : `Version ${release?.sequence ?? ""}`}
          </span>
        </div>
        <h2 className="rr-paper__title">{doc.title}</h2>
        <div className="rr-paper__meta">
          {bytes.sha ? `sha256 ${bytes.sha}` : "file hash unavailable"}
          {bytes.draft ? " · served with a draft marker" : ""}
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
            Comparison of the registered card, from the workspace assessment. The sheet below is the
            file itself, exactly as the server serves it.
          </div>
        </div>
      )}

      <PaperFrame
        title={`${doc.title} — ${mode === "candidate" ? "candidate draft" : "issued edition"}`}
        bytes={bytes}
      />

      <div className="rr-paper__foot">
        <span className="rr-paper__scope">
          Editorial context in this report is not assessed by ResultRipple.
        </span>
        {downloadUrl && (
          <a className="rr-paper__download" href={downloadUrl} download>
            Download Version {release?.sequence}
          </a>
        )}
      </div>
    </article>
  );
}
