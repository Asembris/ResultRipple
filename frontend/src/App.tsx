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
  | { kind: "unreachable"; message: string };

export default function App() {
  const [state, setState] = useState<Load>({ kind: "loading" });
  const [actor, setActor] = useState<Actor | null>(null);
  const [readiness, setReadiness] = useState<ReadinessResponse | null>(null);

  const load = useCallback(async () => {
    try {
      const [workspace, session] = await Promise.all([fetchWorkspace(), fetchSession()]);
      setActor(session.actor);
      setState({ kind: "ready", workspace });
    } catch (error) {
      if (error instanceof ApiRefusal) {
        setState({ kind: "blocked", code: error.code, detail: error.detail });
      } else if (error instanceof ApiUnreachableError) {
        setState({ kind: "unreachable", message: error.message });
      } else {
        setState({ kind: "unreachable", message: "Unexpected API failure" });
      }
    }
    fetchReadiness().then(setReadiness).catch(() => setReadiness(null));
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
              <h2>Backend unreachable</h2>
              <p>{state.message}</p>
              <p className="rr-mono">Start the API with: uvicorn app.main:app --reload</p>
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
