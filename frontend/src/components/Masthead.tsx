import { useState } from "react";

import type { Actor, Workspace } from "../types";
import { STEP_NAMES, type Step } from "../workflow";

/**
 * Wordmark, the story rail and the demo identities.
 *
 * The rail is a progress indicator, not a workflow control: `serverStep` is the
 * furthest step the backend's own state supports, and clicking only changes
 * which panel you are looking at. The ★ marks the current review authority as
 * the graph reports it, never a document owner.
 */
export default function Masthead({
  workspace,
  actor,
  serverStep,
  viewStep,
  onView,
  onSignIn,
  onSignOut,
  onReplayIntro,
  onReload,
  introAvailable,
  busy,
}: {
  workspace: Workspace;
  actor: Actor | null;
  serverStep: Step;
  viewStep: Step;
  onView: (step: Step) => void;
  onSignIn: (personId: string, passcode: string) => Promise<void>;
  onSignOut: () => Promise<void>;
  onReplayIntro: () => void;
  onReload: () => void;
  introAvailable: boolean;
  busy: boolean;
}) {
  const [pending, setPending] = useState<string | null>(null);
  const [passcode, setPasscode] = useState("");
  const [signingIn, setSigningIn] = useState(false);

  const reviewerId = workspace.decision?.current_reviewer_id ?? null;
  const pendingPerson = workspace.people.find((person) => person.person_id === pending) ?? null;

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!pendingPerson) return;
    setSigningIn(true);
    try {
      await onSignIn(pendingPerson.person_id, passcode);
      setPending(null);
    } finally {
      setPasscode("");
      setSigningIn(false);
    }
  };

  return (
    <>
      <header className="rr-header">
        <div className="rr-wordmark">
          <div className="rr-wordmark__name">
            Result<em>Ripple</em>
          </div>
          <div className="rr-wordmark__tag">Graph Hacks 2026 · Track 3</div>
        </div>

        <nav className="rr-rail" aria-label="Story steps">
          {STEP_NAMES.map((name, index) => {
            const step = (index + 1) as Step;
            const done = step < serverStep;
            const current = step === viewStep;
            const reachable = step <= serverStep;
            return (
              <div key={name} style={{ display: "contents" }}>
                <button
                  type="button"
                  className={`rr-rail__step${current ? " rr-rail__step--current" : done ? " rr-rail__step--done" : ""}`}
                  aria-current={current ? "step" : undefined}
                  disabled={!reachable}
                  aria-label={
                    reachable
                      ? `View step ${step}: ${name}`
                      : `Step ${step}: ${name} — not reached yet`
                  }
                  title={
                    reachable
                      ? `View step ${step}: ${name}`
                      : `Step ${step}: ${name} — not reached yet`
                  }
                  onClick={() => onView(step)}
                >
                  <span className="rr-rail__mark">{done ? "✓" : step}</span>
                  <span className="rr-rail__name">{name}</span>
                </button>
                {step < 7 && <span aria-hidden="true" className="rr-rail__sep" />}
              </div>
            );
          })}
        </nav>

        <nav className="rr-personas" aria-label="Demo identities">
          <span className="rr-personas__label">Acting as</span>
          {workspace.people.map((person) => {
            const active = person.person_id === actor?.person_id;
            return (
              <button
                key={person.person_id}
                type="button"
                className={`rr-chip${active ? " rr-chip--active" : ""}`}
                aria-pressed={active}
                aria-label={`${person.display_name} · ${person.demo_role}${
                  person.person_id === reviewerId ? " · current review authority" : ""
                }`}
                title={`${person.display_name} · ${person.demo_role}${
                  person.person_id === reviewerId ? " · current review authority" : ""
                }`}
                onClick={() => {
                  setPasscode("");
                  setPending(person.person_id);
                }}
              >
                <span>{person.demo_role === "operator" ? "Operator" : person.display_name.split(" ")[0]}</span>
                {person.person_id === reviewerId && <span className="rr-chip__star">★</span>}
              </button>
            );
          })}
          {actor && (
            <button type="button" className="rr-ghost" onClick={() => void onSignOut()} disabled={busy}>
              Sign out
            </button>
          )}
          <span className="rr-divider" />
          {introAvailable && (
            <button type="button" className="rr-ghost" title="Replay the introduction" onClick={onReplayIntro}>
              Intro
            </button>
          )}
          <button
            type="button"
            className="rr-ghost"
            title="Re-read the current workspace from FalkorDB. This changes no data."
            onClick={onReload}
            disabled={busy}
          >
            Reload workspace
          </button>
        </nav>
      </header>

      {pendingPerson && (
        <form className="rr-signin" onSubmit={submit}>
          <label htmlFor="rr-passcode">Passcode for {pendingPerson.display_name}</label>
          <input
            id="rr-passcode"
            type="password"
            autoComplete="off"
            value={passcode}
            onChange={(event) => setPasscode(event.target.value)}
            placeholder="server-side demo passcode"
          />
          <div className="rr-signin__row">
            <button type="submit" className="rr-primary" disabled={signingIn || passcode.length === 0}>
              <span>Sign in</span>
              <span>→</span>
            </button>
            <button type="button" className="rr-secondary" onClick={() => setPending(null)}>
              Cancel
            </button>
          </div>
          <span className="rr-signin__hint">
            Resolved server-side. Printed in the API log at startup, or set through DEMO_PASSCODES.
          </span>
        </form>
      )}
    </>
  );
}
