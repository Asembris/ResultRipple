/**
 * React mount for `graph-scene.js`.
 *
 * `animate` must be true ONLY when `stage` changed because a server response
 * committed it: a successful mutation followed by a fresh `fetchWorkspace()`.
 * Initial load, reload and polling pass false, so no choreography can ever
 * suggest that something happened which the backend did not confirm.
 */
import { useEffect, useRef } from "react";

import { createScene, type HoverInfo, type SceneHandle } from "./graph-scene.js";
import type { SceneStage } from "./stageFromWorkspace";

export interface GraphInsets {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export interface GraphStageProps {
  stage: SceneStage;
  animate: boolean;
  insets: GraphInsets;
  playIntro: boolean;
  reduced: boolean;
  drift?: boolean;
  flow?: boolean;
  selected: string | null;
  onIntroDone: () => void;
  onHover: (hover: HoverInfo | null) => void;
  onSelect: (id: string | null) => void;
  onReady?: (scene: SceneHandle | null) => void;
  onFailed?: (error: unknown) => void;
}

export default function GraphStage(props: GraphStageProps) {
  const graphRef = useRef<HTMLDivElement>(null);
  const labelRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<SceneHandle | null>(null);
  const latest = useRef(props);
  latest.current = props;

  useEffect(() => {
    const container = graphRef.current;
    const labelLayer = labelRef.current;
    if (!container || !labelLayer) return;

    let scene: SceneHandle;
    try {
      scene = createScene({
        container,
        labelLayer,
        // Geometry is built from the first real stage, never from a constant.
        stage: latest.current.stage,
        reduced: latest.current.reduced,
        drift: latest.current.drift ?? true,
        flow: latest.current.flow ?? true,
        onHover: (hover) => latest.current.onHover(hover),
        onSelect: (id) => {
          scene.select(id);
          latest.current.onSelect(id);
        },
      });
    } catch (error) {
      latest.current.onFailed?.(error);
      latest.current.onIntroDone();
      return;
    }

    sceneRef.current = scene;
    scene.setStage(latest.current.stage, false);
    scene.setInsets(latest.current.insets);
    latest.current.onReady?.(scene);

    let guard = 0;
    if (latest.current.playIntro && !latest.current.reduced && scene.webgl) {
      scene.playIntro(() => latest.current.onIntroDone());
      // Safety net from the prototype: a throttled rAF must never strand the intro.
      guard = window.setTimeout(() => scene.skipIntro(), 3600);
    } else {
      latest.current.onIntroDone();
    }

    // StrictMode mounts twice in development; this must release everything.
    return () => {
      if (guard) window.clearTimeout(guard);
      scene.dispose();
      sceneRef.current = null;
      latest.current.onReady?.(null);
    };
    // Mount once. Later changes flow through the effects below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const stageKey = JSON.stringify(props.stage);
  useEffect(() => {
    sceneRef.current?.setStage(props.stage, props.animate);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stageKey]);

  useEffect(() => {
    sceneRef.current?.setInsets(props.insets);
  }, [props.insets.top, props.insets.right, props.insets.bottom, props.insets.left]);

  useEffect(() => {
    sceneRef.current?.setOptions({
      drift: props.drift ?? true,
      flow: props.flow ?? true,
      reduced: props.reduced,
    });
  }, [props.drift, props.flow, props.reduced]);

  useEffect(() => {
    sceneRef.current?.select(props.selected);
  }, [props.selected]);

  return (
    <>
      <div
        ref={graphRef}
        className="rr-graph__canvas"
        role="img"
        aria-label="Evidence-to-decision graph: batches, lanes, comparison, shared finding, two reports, the South lane expansion proposal and its review authority"
      />
      <div ref={labelRef} aria-hidden="true" className="rr-graph__labels" />
      <div aria-hidden="true" className="rr-graph__vignette" />
    </>
  );
}
