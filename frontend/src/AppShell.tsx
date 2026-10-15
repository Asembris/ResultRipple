import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { ApiRefusal, fetchPlan } from "./api";
import DocumentViewer from "./components/DocumentViewer";
import EconomicsStrip from "./components/EconomicsStrip";
import Masthead from "./components/Masthead";
import NodeInspector, { HoverTip } from "./components/NodeInspector";
import WorkflowPanel from "./components/WorkflowPanel";
import type { StageContext, ViewerTab } from "./components/stages/context";
import GraphStage, { type GraphInsets } from "./graph/GraphStage";
import type { HoverInfo, NodeDescription, SceneHandle } from "./graph/graph-scene.js";
import { stageFromWorkspace } from "./graph/stageFromWorkspace";
import type { Actor, Plan, ReadinessResponse, Workspace } from "./types";
import {
  activeCase,
  correctionCommitted,
  focusForStep,
  latestPlanSummary,
  stepState,
  STEP_NAMES,
  type Step,
} from "./workflow";

const prefersReducedMotion = () => {
  try {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
};

function panelWidth(viewportWidth: number): number {
  if (viewportWidth >= 1500) return 560;
  if (viewportWidth >= 1180) return 470;
  return Math.max(340, Math.round(viewportWidth * 0.48));
}

export default function AppShell({
  workspace,
  actor,
  readiness,
  reload,
  signIn,
  signOut,
}: {
  workspace: Workspace;
  actor: Actor | null;
  readiness: ReadinessResponse | null;
  reload: () => Promise<void>;
  signIn: (personId: string, passcode: string) => Promise<void>;
  signOut: () => Promise<void>;
}) {
  const [viewport, setViewport] = useState(() => window.innerWidth);
  const [reduced, setReduced] = useState(prefersReducedMotion);
  const [introPlaying, setIntroPlaying] = useState(false);
  const [introDone, setIntroDone] = useState(false);
  const [introKey, setIntroKey] = useState(0);
  const [graphFailed, setGraphFailed] = useState(false);

  const [hover, setHover] = useState<HoverInfo | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [description, setDescription] = useState<NodeDescription | null>(null);
  const sceneRef = useRef<SceneHandle | null>(null);

  const [viewer, setViewer] = useState<ViewerTab | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [refusal, setRefusal] = useState<ApiRefusal | null>(null);
  const [busy, setBusy] = useState(false);
  const [view, setView] = useState<Step | null>(null);
  const [animate, setAnimate] = useState(false);

  const [plan, setPlan] = useState<Plan | null>(null);
  const [priorPlan, setPriorPlan] = useState<Plan | null>(null);

  const toastTimer = useRef(0);

  const kase = useMemo(() => activeCase(workspace), [workspace]);
  const latest = useMemo(() => latestPlanSummary(kase), [kase]);

  // The latest plan version, read back from the API. Plan state is never
  // inferred from the summary alone.
  useEffect(() => {
    let cancelled = false;
    if (!latest) {
      setPlan(null);
      setPriorPlan(null);
      return;
    }
    fetchPlan(latest.plan_id)
      .then((value) => {
        if (!cancelled) setPlan(value);
      })
      .catch(() => {
        if (!cancelled) setPlan(null);
      });
    const previous = (kase?.plans ?? [])
      .filter((entry) => entry.version < latest.version)
      .sort((a, b) => b.version - a.version)[0];
    if (previous) {
      fetchPlan(previous.plan_id)
        .then((value) => {
          if (!cancelled) setPriorPlan(value);
        })
        .catch(() => {
          if (!cancelled) setPriorPlan(null);
        });
    } else {
      setPriorPlan(null);
    }
    return () => {
      cancelled = true;
    };
  }, [latest?.plan_id, latest?.status, latest?.version, workspace.context_revision, kase]);

  const { reachable, fallback } = useMemo(() => stepState(workspace, plan), [workspace, plan]);
  const step: Step = view !== null && view <= reachable ? view : fallback;
  const correctionPending = !!kase && !correctionCommitted(workspace, kase);
  const focus = focusForStep(step, correctionPending);

  const stage = useMemo(
    () => stageFromWorkspace(workspace, plan, focus),
    [workspace, plan, focus],
  );
  const stageKey = JSON.stringify(stage);
  const lastStageKey = useRef(stageKey);

  // The animate flag is consumed by the first stage change after a committed
  // mutation, then cleared. Reloads, polling and refusals never animate.
  useEffect(() => {
    if (lastStageKey.current === stageKey) return;
    lastStageKey.current = stageKey;
    if (animate) setAnimate(false);
  }, [stageKey, animate]);

  useEffect(() => {
    const onResize = () => setViewport(window.innerWidth);
    window.addEventListener("resize", onResize);
    let media: MediaQueryList | null = null;
    const onMotion = (event: MediaQueryListEvent) => setReduced(event.matches);
    try {
      media = window.matchMedia("(prefers-reduced-motion: reduce)");
      media.addEventListener("change", onMotion);
    } catch {
      media = null;
    }
    return () => {
      window.removeEventListener("resize", onResize);
      media?.removeEventListener("change", onMotion);
    };
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        if (introPlaying) sceneRef.current?.skipIntro() ?? setIntroPlaying(false);
        else if (viewer) setViewer(null);
        else if (selected) closeInspector();
      } else if (introPlaying && (event.key === "Enter" || event.key === " ")) {
        sceneRef.current?.skipIntro() ?? setIntroPlaying(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [introPlaying, viewer, selected]);

  useEffect(() => () => window.clearTimeout(toastTimer.current), []);

  const notify = useCallback((message: string) => {
    setToast(message);
    window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), 2600);
  }, []);

  const closeInspector = useCallback(() => {
    sceneRef.current?.select(null);
    setSelected(null);
    setDescription(null);
  }, []);

  const onSelect = useCallback((id: string | null) => {
    setSelected(id);
    setDescription(id ? (sceneRef.current?.describe(id) ?? null) : null);
  }, []);

  const focusNode = useCallback((id: string) => {
    sceneRef.current?.select(id);
    setSelected(id);
    setDescription(sceneRef.current?.describe(id) ?? null);
  }, []);

  // Re-describe the selected node whenever the data behind it moves.
  useEffect(() => {
    if (selected) setDescription(sceneRef.current?.describe(selected) ?? null);
  }, [selected, stageKey]);

  const commit = useCallback(
    async <T,>(action: () => Promise<T>): Promise<T | null> => {
      setBusy(true);
      setRefusal(null);
      try {
        const result = await action();
        setAnimate(true);
        setView(null);
        await reload();
        return result;
      } catch (error) {
        if (error instanceof ApiRefusal) setRefusal(error);
        else {
          console.error(error);
          notify("The request could not be completed.");
        }
        // A refusal still moves the world: re-read it rather than guess.
        await reload();
        return null;
      } finally {
        setBusy(false);
      }
    },
    [reload, notify],
  );

  const width = panelWidth(viewport);
  const insets: GraphInsets = useMemo(
    () => (introDone ? { top: 120, right: width, bottom: 190, left: 0 } : { top: 0, right: 0, bottom: 0, left: 0 }),
    [introDone, width],
  );

  const chrome = {
    opacity: introDone ? 1 : 0,
    pointerEvents: introDone ? ("auto" as const) : ("none" as const),
  };

  const context: StageContext = {
    workspace,
    actor,
    readiness,
    kase,
    plan,
    priorPlan,
    busy,
    step,
    serverStep: reachable,
    currentStep: fallback,
    goTo: (next) => setView(next),
    commit,
    focusNode,
    openViewer: (tab) => setViewer(tab),
    refusal,
    dismissRefusal: () => setRefusal(null),
    notify,
  };

  return (
    <div className="rr-app">
      <GraphStage
        key={`graph-${introKey}`}
        stage={stage}
        animate={animate}
        insets={insets}
        playIntro={introKey === 0 ? !introDone : true}
        reduced={reduced}
        selected={selected}
        onIntroDone={() => {
          setIntroPlaying(false);
          setIntroDone(true);
        }}
        onHover={setHover}
        onSelect={onSelect}
        onReady={(scene) => {
          sceneRef.current = scene;
          if (scene && scene.webgl && !reduced && !introDone) setIntroPlaying(true);
        }}
        onFailed={() => setGraphFailed(true)}
      />

      <div className="rr-sr-only" aria-live="polite">
        {`Step ${step} of 7: ${STEP_NAMES[step - 1]}`}
      </div>

      {graphFailed && (
        <div className="rr-graphfail">
          The 3D graph could not load in this browser. The workflow on the right still works end to
          end.
        </div>
      )}

      {introPlaying && (
        <>
          <div className="rr-intro">
            <div className="rr-intro__word">
              Result<em>Ripple</em>
            </div>
            <div className="rr-intro__line">When evidence changes, every linked decision knows</div>
          </div>
          <button
            type="button"
            className="rr-intro__skip"
            onClick={() => {
              sceneRef.current?.skipIntro();
              setIntroPlaying(false);
              setIntroDone(true);
            }}
          >
            Skip intro · Esc
          </button>
        </>
      )}

      <div style={{ ...chrome, transform: `translateY(${introDone ? 0 : -14}px)`, transition: "opacity .9s ease, transform .9s cubic-bezier(.2,.7,.2,1)" }}>
        <Masthead
          workspace={workspace}
          actor={actor}
          serverStep={reachable}
          viewStep={step}
          onView={(next) => setView(next)}
          onSignIn={async (personId, passcode) => {
            setRefusal(null);
            try {
              await signIn(personId, passcode);
              notify(`Signed in as ${workspace.people.find((p) => p.person_id === personId)?.display_name ?? personId}`);
            } catch (error) {
              if (error instanceof ApiRefusal) setRefusal(error);
              else console.error(error);
            }
          }}
          onSignOut={async () => {
            await signOut();
            notify("Signed out · observing read-only");
          }}
          onReplayIntro={() => {
            setIntroDone(false);
            setViewer(null);
            closeInspector();
            setIntroKey((value) => value + 1);
          }}
          onReload={() => {
            void reload();
            notify("Workspace re-read from FalkorDB");
          }}
          introAvailable={!reduced && !graphFailed}
          busy={busy}
        />
      </div>

      <div className="rr-graphnote" style={{ opacity: introDone ? 1 : 0 }}>
        <span className="rr-graphnote__live">Live FalkorDB context · context rev {workspace.context_revision}</span>
        <span className="rr-graphnote__hint">
          Hover to trace a path · click to inspect · drag to orbit · double-click to recentre
        </span>
      </div>

      {hover && !introPlaying && <HoverTip hover={hover} />}

      {description && introDone && (
        <NodeInspector
          info={description}
          onClose={closeInspector}
          onOpenDocument={() => setViewer(plan && plan.status !== "ISSUED" ? "candidate" : "current")}
        />
      )}

      {workspace.comparison && (
        <EconomicsStrip
          comparison={workspace.comparison}
          assessment={workspace.assessment}
          reduced={reduced}
          style={{
            right: width + 28,
            opacity: introDone ? 1 : 0,
            transform: `translateY(${introDone ? 0 : 24}px)`,
          }}
        />
      )}

      {toast && (
        <div className="rr-toast" role="status" style={{ right: width + 28 }}>
          {toast}
        </div>
      )}

      <aside
        className="rr-panel"
        aria-label="Workflow"
        style={{
          width,
          ...chrome,
          transform: `translateX(${introDone ? 0 : 48}px)`,
        }}
      >
        <WorkflowPanel context={context} />
      </aside>

      {viewer && (
        <DocumentViewer
          tab={viewer}
          onTab={setViewer}
          context={context}
          onClose={() => setViewer(null)}
        />
      )}
    </div>
  );
}
