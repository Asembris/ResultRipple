import { useCallback, useEffect, useState } from "react";

import { ApiUnreachableError, apiBaseUrl, fetchReadiness } from "./api";
import type { ReadinessResponse } from "./types";

type State =
  | { kind: "loading" }
  | { kind: "loaded"; readiness: ReadinessResponse }
  | { kind: "api-error"; message: string };

export default function App() {
  const [state, setState] = useState<State>({ kind: "loading" });

  const load = useCallback(async () => {
    setState({ kind: "loading" });
    try {
      setState({ kind: "loaded", readiness: await fetchReadiness() });
    } catch (error) {
      const message =
        error instanceof ApiUnreachableError ? error.message : "Unexpected API failure";
      setState({ kind: "api-error", message });
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <main className="page">
      <header className="masthead">
        <h1>ResultRipple</h1>
        <p className="tagline">
          When evidence behind a recommendation changes, ResultRipple finds every linked
          report, prepares the responsible person&rsquo;s review, and issues corrected
          editions after approval.
        </p>
        <p className="track">Graph Hacks 2026 &middot; Track 3 &mdash; Company Brain</p>
      </header>

      <section className="panel" aria-labelledby="status-heading">
        <h2 id="status-heading">System readiness</h2>
        {state.kind === "loading" && <p role="status">Checking backend&hellip;</p>}
        {state.kind === "api-error" && <ApiError message={state.message} onRetry={load} />}
        {state.kind === "loaded" && (
          <Readiness readiness={state.readiness} onRetry={load} />
        )}
      </section>

      <footer className="footnote">
        <p>
          Bootstrap foundation only. No correction case, finding registry, agent, or
          release workflow is implemented yet.
        </p>
      </footer>
    </main>
  );
}

function ApiError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="status status--down">
      <p>
        <strong>Backend unreachable.</strong> {message}
      </p>
      <p className="hint">Start the API with: uvicorn app.main:app --reload</p>
      <RetryButton onRetry={onRetry} />
    </div>
  );
}

function Readiness({
  readiness,
  onRetry,
}: {
  readiness: ReadinessResponse;
  onRetry: () => void;
}) {
  const { falkordb } = readiness;
  return (
    <div className={`status ${readiness.ready ? "status--up" : "status--degraded"}`}>
      <p className="verdict">
        {readiness.ready ? "API and FalkorDB reachable" : "Graph-backed work unavailable"}
      </p>
      <dl>
        <dt>API</dt>
        <dd>
          {readiness.service} v{readiness.version} at {apiBaseUrl}
        </dd>
        <dt>FalkorDB</dt>
        <dd>
          {falkordb.connected
            ? `connected to graph "${falkordb.graph}" at ${falkordb.endpoint}`
            : `${falkordb.error_code ?? "UNKNOWN"} at ${falkordb.endpoint}`}
        </dd>
        {falkordb.connected && falkordb.server_version && (
          <>
            <dt>Server</dt>
            <dd>
              Redis {falkordb.server_version}
              {falkordb.latency_ms !== null && ` · probe ${falkordb.latency_ms} ms`}
            </dd>
          </>
        )}
        {!falkordb.connected && falkordb.error_detail && (
          <>
            <dt>Detail</dt>
            <dd className="detail">{falkordb.error_detail}</dd>
          </>
        )}
        <dt>Implemented</dt>
        <dd>{readiness.implemented_scope.join(", ") || "none"}</dd>
      </dl>
      <RetryButton onRetry={onRetry} />
    </div>
  );
}

function RetryButton({ onRetry }: { onRetry: () => void }) {
  return (
    <button type="button" onClick={onRetry}>
      Re-check
    </button>
  );
}
