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

export const PALETTE: Record<"ivory" | "amber" | "coral" | "sage" | "dim" | "faint", string>;
export const LAYERS: [string, number][];
