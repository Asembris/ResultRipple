import { editionUrl, receiptUrl } from "../api";
import type { Workspace } from "../types";
import ComparisonBars from "./ComparisonBars";

/**
 * Two readable document cards, the shared finding, the proposal status, and the
 * current editions. The desk never simulates an impact answer: everything shown
 * here arrived from `/workspace`, which reads FalkorDB.
 */
export default function PublishingDesk({ state }: { state: Workspace }) {
  const current = state.current_release;
  const artifacts: Record<string, { title: string; sha256: string }> = current
    ? JSON.parse(current.artifacts)
    : {};
  const outOfDate = state.assessment.filter((entry) => entry.relation_changed || entry.magnitude_changed);

  return (
    <section className="panel" aria-labelledby="desk-heading">
      <h2 id="desk-heading">Publishing desk</h2>
      <p className="panel__lead">
        1 shared finding &middot; {state.assessment.length} registered uses &middot;{" "}
        {outOfDate.length === 0 ? "Linked findings checked" : "Review needed"}
      </p>

      {state.hold && (
        <p className="flag flag--held">
          Evidence held: <strong>{state.hold.code}</strong>. {state.hold.detail}
        </p>
      )}

      {state.comparison && (
        <div className="card">
          <h3>Live comparison</h3>
          <ComparisonBars comparison={state.comparison} />
          <p className="meta">
            {state.comparison.comparison_id} &middot; metric {state.comparison.metric_key} &middot;
            owner {state.comparison.owner_name} &middot; minimum {state.comparison.min_n} batches per side
          </p>
        </div>
      )}

      <div className="documents">
        {state.scope.map((doc) => {
          const assessment = state.assessment.find((entry) => entry.document_id === doc.document_id);
          const stale = assessment?.relation_changed || assessment?.magnitude_changed;
          return (
            <article key={doc.document_id} className="card document">
              <header>
                <h3>{doc.title}</h3>
                <p className="meta">Owner: {doc.owner_name}</p>
              </header>
              {assessment && (
                <>
                  <p className="published">
                    <span className="label">Published in the current edition</span>
                    {assessment.previous?.text ?? "not yet published"}
                  </p>
                  {stale ? (
                    <p className="flag flag--stale">
                      Out of date against current evidence &mdash; now:{" "}
                      <strong>{assessment.current.text}</strong>
                      {assessment.relation_changed && <span> (direction changed)</span>}
                    </p>
                  ) : (
                    <p className="flag flag--ok">Matches current evidence</p>
                  )}
                </>
              )}
              {current && artifacts[doc.document_id] && (
                <p className="editions">
                  <a href={editionUrl(current.release_id, doc.document_id)} target="_blank" rel="noreferrer">
                    Open current edition
                  </a>
                  {" · "}
                  <a href={editionUrl(current.release_id, doc.document_id, true)}>Download</a>
                </p>
              )}
              <p className="unassessed">
                Editorial context in this report is not assessed by ResultRipple.
              </p>
            </article>
          );
        })}
      </div>

      {state.decision && (
        <div className="card decision">
          <h3>{state.decision.title}</h3>
          <p>
            Status: <strong>{state.decision.status.replace(/_/g, " ").toLowerCase()}</strong>
          </p>
          <p className="meta">
            Recorded basis: {state.decision.basis_claim_id ?? "none recorded"} &middot; owning team{" "}
            {state.decision.team_name} &middot; current reviewer{" "}
            <strong>{state.decision.current_reviewer_name ?? "none"}</strong>
          </p>
        </div>
      )}

      <div className="card">
        <h3>Editions</h3>
        <ol className="releases">
          {state.releases.map((release) => (
            <li key={release.release_id}>
              Version {release.sequence} &middot; {release.release_id}{" "}
              {release.is_current ? <span className="flag flag--ok">current</span> : <span className="meta">superseded</span>}{" "}
              <a href={receiptUrl(release.release_id)} target="_blank" rel="noreferrer">
                receipt
              </a>
            </li>
          ))}
        </ol>
        <p className="unassessed">{state.verification_scope}</p>
      </div>
    </section>
  );
}
