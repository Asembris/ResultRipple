import type { ApiRefusal } from "../../api";
import type { Actor, Comparison, CorrectionCase, Plan, ReadinessResponse, Workspace } from "../../types";
import type { Step } from "../../workflow";

export type ViewerTab = "current" | "candidate";

/**
 * What every workflow stage is given. Each field is either a server response or
 * a way to make a real request; no stage holds workflow state of its own.
 */
export interface StageContext {
  workspace: Workspace;
  actor: Actor | null;
  readiness: ReadinessResponse | null;
  kase: CorrectionCase | null;
  /** The case's latest plan version, read back from `GET /plans/{id}`. */
  plan: Plan | null;
  /** The version before it, when one exists: used to compare candidate hashes. */
  priorPlan: Plan | null;
  /** The comparison on the previous distinct fetch, when this session saw one. */
  previousComparison: Comparison | null;
  busy: boolean;
  step: Step;
  /** Furthest panel the data makes sense to show. */
  serverStep: Step;
  /** Where the view sits when the viewer has not chosen: what is actually current. */
  currentStep: Step;
  goTo: (step: Step) => void;
  /**
   * Run a real mutation, then re-read the workspace and let the graph animate
   * the confirmed change. A refusal is surfaced and nothing moves.
   */
  commit: <T>(action: () => Promise<T>) => Promise<T | null>;
  focusNode: (id: string) => void;
  openViewer: (tab: ViewerTab) => void;
  refusal: ApiRefusal | null;
  dismissRefusal: () => void;
  notify: (message: string) => void;
}
