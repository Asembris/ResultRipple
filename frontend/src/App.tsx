import { useCallback, useEffect, useState } from "react";

import {
  ApiRefusal,
  ApiUnreachableError,
  apiBaseUrl,
  fetchReadiness,
  fetchSession,
  fetchWorkspace,
  signOut,
  startSession,
} from "./api";
import AppShell from "./AppShell";
import type { Actor, ReadinessResponse, Workspace } from "./types";

type Load =
  | { kind: "loading" }
  | { kind: "ready"; workspace: Workspace }
  | { kind: "blocked"; code: string; detail: string }
  | { kind: "graph-unavailable"; readiness: ReadinessResponse }
  | { kind: "unreachable"; message: string };

export default function App() {
  const [state, setState] = useState<Load>({ kind: "loading" });
  const [actor, setActor] = useState<Actor | null>(null);
  const [readiness, setReadiness] = useState<ReadinessResponse | null>(null);

  const load = useCallback(async () => {
    // Readiness is asked in parallel so a failure can be named honestly: the
    // API not answering at all is a different outage from FalkorDB being down.
    const ready = fetchReadiness().then(
      (value) => ({ value, unreachable: false }),
      (error: unknown) => ({ value: null, unreachable: error instanceof ApiUnreachableError }),
    );
    try {
      const [workspace, session] = await Promise.all([fetchWorkspace(), fetchSession()]);
      setActor(session.actor);
      setState({ kind: "ready", workspace });
    } catch (error) {
      const probe = await ready;
      if (error instanceof ApiUnreachableError || probe.unreachable) {
        setState({
          kind: "unreachable",
          message: error instanceof Error ? error.message : "API unreachable",
        });
      } else if (probe.value && !probe.value.falkordb.connected) {
        setState({ kind: "graph-unavailable", readiness: probe.value });
      } else if (error instanceof ApiRefusal) {
        setState({ kind: "blocked", code: error.code, detail: error.detail });
      } else {
        setState({ kind: "unreachable", message: "Unexpected API failure" });
      }
    }
    setReadiness((await ready).value);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const signIn = useCallback(
    async (personId: string, passcode: string) => {
      setActor(await startSession(personId, passcode));
      await load();
    },
    [load],
  );

  const observe = useCallback(async () => {
    await signOut();
    setActor(null);
    await load();
  }, [load]);

  if (state.kind === "ready") {
    return (
      <AppShell
        workspace={state.workspace}
        actor={actor}
        readiness={readiness}
        reload={load}
        signIn={signIn}
        signOut={observe}
      />
    );
  }

  return (
    <div className="rr-app">
      <div className="rr-status">
        <div className="rr-status__card">
          {state.kind === "loading" && (
            <>
              <h2>Reading current context…</h2>
              <p role="status">Impact, review and release answers always query FalkorDB.</p>
            </>
          )}

          {state.kind === "unreachable" && (
            <>
              <h2>API unreachable</h2>
              <p>
                The ResultRipple API did not answer. Nothing about the workspace can be read until
                it does, and nothing is shown in its place.
              </p>
              <div className="rr-status__code">{state.message}</div>
              {import.meta.env.DEV && (
                <p className="rr-mono">Start the API with: uvicorn app.main:app --reload</p>
              )}
              <button type="button" className="rr-primary" onClick={() => void load()}>
                <span>Re-check</span>
                <span>→</span>
              </button>
            </>
          )}

          {state.kind === "graph-unavailable" && (
            <>
              <h2>FalkorDB unavailable</h2>
              <div className="rr-status__code">
                {state.readiness.falkordb.error_code ?? "GRAPH_UNAVAILABLE"}
              </div>
              <p>
                The API is up, but the graph that holds the workspace is not answering. Impact,
                review and release answers always query FalkorDB, so new answers stop until it
                returns. Editions already issued remain readable at their links.
              </p>
              <button type="button" className="rr-primary" onClick={() => void load()}>
                <span>Re-check</span>
                <span>→</span>
              </button>
            </>
          )}

          {state.kind === "blocked" && (
            <>
              <h2>Graph-backed work unavailable</h2>
              <div className="rr-status__code">{state.code}</div>
              <p>{state.detail}</p>
              <p>
                Impact, review and release answers always query FalkorDB. Editions already issued
                remain readable; new answers stop.
              </p>
              <button type="button" className="rr-primary" onClick={() => void load()}>
                <span>Re-check</span>
                <span>→</span>
              </button>
            </>
          )}

          <p className="rr-mono">
            API {readiness?.version ?? "—"} at {apiBaseUrl}
            {readiness?.falkordb.connected === false
              ? ` · ${readiness.falkordb.error_code} at ${readiness.falkordb.endpoint}`
              : ""}
          </p>
        </div>
      </div>
    </div>
  );
}
