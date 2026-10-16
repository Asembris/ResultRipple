import type { SceneStage } from "./stageFromWorkspace";

export interface HoverInfo {
  id: string;
  x: number;
  y: number;
  title: string;
  kind: string;
}

export interface NodeDescription {
  id: string;
  kind: string;
  title: string;
  rows: { k: string; v: string }[];
  rels: string[];
  isDoc: boolean;
}

export interface SceneHandle {
  webgl: boolean;
  setStage(stage: SceneStage, animate: boolean): void;
  playIntro(done?: () => void): void;
  skipIntro(): void;
  setInsets(v: Partial<{ top: number; right: number; bottom: number; left: number }>): void;
  setOptions(o: Partial<{ drift: boolean; flow: boolean; reduced: boolean }>): void;
  select(id: string | null): void;
  describe(id: string): NodeDescription | null;
  dispose(): void;
}

export function createScene(opts: {
  container: HTMLElement;
  labelLayer: HTMLElement;
  /** The first real stage. Node and edge geometry is built from it. */
  stage: SceneStage;
  onHover?: (h: HoverInfo | null) => void;
  onSelect?: (id: string | null) => void;
  reduced?: boolean;
  drift?: boolean;
  flow?: boolean;
}): SceneHandle;

/** Scene derivation, exported so tests can run the real functions on real stages. */
export interface SceneEdgeDef {
  id: string;
  kind: string;
  rel: string;
}
export function edgeDefs(stage: SceneStage): SceneEdgeDef[];
export function edgeTarget(edge: SceneEdgeDef, stage: SceneStage): { vis: boolean; tone: string };
export function nodeText(
  node: { id: string; type?: string },
  stage: SceneStage,
): { sub?: string; tag: [string, string] | null };

export const PALETTE: Record<"ivory" | "amber" | "coral" | "sage" | "dim" | "faint", string>;
export const LAYERS: [string, number][];

/** Label placement, exported so tests can run the real functions. */
export interface SceneLabel {
  el: HTMLDivElement;
  w?: number;
  h?: number;
}
export function makeLabel(
  def: { type: string; label: string; anchor: "left" | "right" | "below" | "above"; fallback?: "below" },
  layer: HTMLElement,
): SceneLabel;
export function placeLabel(
  label: SceneLabel,
  anchor: "left" | "right" | "below" | "above",
  x: number,
  y: number,
  bounds?: { left: number; top: number; right: number; bottom: number; floor: number },
): void;
