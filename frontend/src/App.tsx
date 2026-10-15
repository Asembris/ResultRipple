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
import CorrectionCase from "./components/CorrectionCase";
import PublishingDesk from "./components/PublishingDesk";
import ReviewPane from "./components/ReviewPane";
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
  const [refusal, setRefusal] = useState<ApiRefusal | null>(null);

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

  const onError = (error: unknown) => {
    setRefusal(error instanceof ApiRefusal ? error : null);
    if (!(error instanceof ApiRefusal)) console.error(error);
  };

  const signIn = async (personId: string, passcode: string) => {
    setRefusal(null);
    setActor(await startSession(personId, passcode));
    await load();
  };

  const observe = async () => {
    setRefusal(null);
    await signOut();
    setActor(null);
    await load();
  };

  return (
    <main className="page">
      <header className="masthead">
        <h1>ResultRipple</h1>
        <p className="tagline">
          When evidence behind a recommendation changes, ResultRipple finds every linked
          report, prepares the responsible person&rsquo;s review, and issues corrected editions
          after approval.
        </p>
        <p className="track">Graph Hacks 2026 &middot; Track 3 &mdash; Company Brain</p>
      </header>

      {state.kind === "ready" && (
        <RoleBar
          people={state.workspace.people}
          actor={actor}
          reviewerId={state.workspace.decision?.current_reviewer_id ?? null}
          onSignIn={signIn}
          onObserve={observe}
          onError={onError}
        />
      )}

      {refusal && (
        <div className="panel refusal" role="alert">
          <h2>Action refused: {refusal.code}</h2>
          <p>{refusal.detail}</p>
          {Object.keys(refusal.context).length > 0 && (
            <pre className="witness">{JSON.stringify(refusal.context, null, 2)}</pre>
          )}
          <button type="button" className="secondary" onClick={() => setRefusal(null)}>
            Dismiss
          </button>
        </div>
      )}

      {state.kind === "loading" && <p role="status">Reading current context&hellip;</p>}

      {state.kind === "unreachable" && (
        <div className="panel status status--down">
          <h2>Backend unreachable</h2>
          <p>{state.message}</p>
          <p className="hint">Start the API with: uvicorn app.main:app --reload</p>
          <button type="button" onClick={() => void load()}>Re-check</button>
        </div>
      )}

      {state.kind === "blocked" && (
        <div className="panel status status--down">
          <h2>Graph-backed work unavailable</h2>
          <p>
            <strong>{state.code}</strong> &mdash; {state.detail}
          </p>
          <p className="hint">
            Impact, review and release answers always query FalkorDB. Editions already issued
            remain readable; new answers stop.
          </p>
          <button type="button" onClick={() => void load()}>Re-check</button>
        </div>
      )}

      {state.kind === "ready" && (
        <>
          <PublishingDesk state={state.workspace} />
          <CorrectionCase
            state={state.workspace}
            actor={actor}
            onChange={load}
            onError={onError}
          />
          <ReviewPane state={state.workspace} actor={actor} onChange={load} onError={onError} />
        </>
      )}

      <footer className="footnote">
        <p>
          All organizational data is fictional demo setup. A positive check applies only to the
          registered finding cards and the typed decision block in the named versions.
        </p>
        {readiness && (
          <p className="meta">
            API {readiness.version} at {apiBaseUrl} &middot;{" "}
            {readiness.falkordb.connected
              ? `FalkorDB graph "${readiness.falkordb.graph}" at ${readiness.falkordb.endpoint}`
              : `${readiness.falkordb.error_code} at ${readiness.falkordb.endpoint}`}
          </p>
        )}
      </footer>
    </main>
  );
}

/**
 * Signing in needs the server-side passcode for that identity. The operator
 * types it; it is never shipped in this bundle or stored in the browser.
 */
function RoleBar({
  people,
  actor,
  reviewerId,
  onSignIn,
  onObserve,
  onError,
}: {
  people: Workspace["people"];
  actor: Actor | null;
  reviewerId: string | null;
  onSignIn: (personId: string, passcode: string) => Promise<void>;
  onObserve: () => Promise<void>;
  onError: (error: unknown) => void;
}) {
  const [pending, setPending] = useState<string | null>(null);
  const [passcode, setPasscode] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!pending) return;
    setBusy(true);
    try {
      await onSignIn(pending, passcode);
      setPending(null);
    } catch (error) {
      onError(error);
    } finally {
      setPasscode("");
      setBusy(false);
    }
  };

  const pendingPerson = people.find((person) => person.person_id === pending);

  return (
    <nav className="rolebar" aria-label="Demo identities">
      <span className="label">Signed in as</span>
      <strong>
        {actor ? `${actor.display_name} (${actor.demo_role})` : "an observer (read-only)"}
      </strong>
      <span className="rolebar__buttons">
        {people.map((person) => (
          <button
            key={person.person_id}
            type="button"
            className={person.person_id === actor?.person_id ? "" : "secondary"}
            onClick={() => {
              setPasscode("");
              setPending(person.person_id);
            }}
          >
            {person.display_name}
            {person.person_id === reviewerId ? " ★" : ""}
          </button>
        ))}
        {actor && (
          <button type="button" className="secondary" onClick={() => void onObserve()}>
            Sign out
          </button>
        )}
      </span>
      <span className="meta">&#9733; current review authority, read from the graph</span>
      {pendingPerson && (
        <form className="rolebar__signin" onSubmit={submit}>
          <label htmlFor="demo-passcode">Passcode for {pendingPerson.display_name}</label>
          <input
            id="demo-passcode"
            type="password"
            autoComplete="off"
            value={passcode}
            onChange={(event) => setPasscode(event.target.value)}
            placeholder="server-side demo passcode"
          />
          <button type="submit" disabled={busy || passcode.length === 0}>
            Sign in
          </button>
          <button type="button" className="secondary" onClick={() => setPending(null)}>
            Cancel
          </button>
          <span className="meta">
            Printed in the API log at startup, or set through DEMO_PASSCODES.
          </span>
        </form>
      )}
    </nav>
  );
}
