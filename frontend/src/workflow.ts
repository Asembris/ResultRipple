/**
 * Everything the interface knows about "where the story is" is derived here,
 * from server responses alone. There is no stored step, no timer and no local
 * flag that can claim progress the backend has not recorded.
 *
 * `serverStep` is the furthest step the data supports. The viewer may look at
 * an earlier step; nothing they can click moves `serverStep`, because only the
 * API does that.
 */
import type { Focus } from "./graph/stageFromWorkspace";
import type { Assessment, CorrectionCase, Plan, PlanSummary, Workspace } from "./types";

export const CASE_REF = "DX-2026-0914";

export const STEP_NAMES = [
  "Desk",
  "Correction",
  "Investigation",
  "Review",
  "Authority",
  "Fresh approval",
  "Editions",
] as const;

export type Step = 1 | 2 | 3 | 4 | 5 | 6 | 7;

/** An authoring-start workspace's first edition. It is not a correction. */
export const INITIAL_PUBLICATION_REF = "INITIAL-PUBLICATION";

export function activeCase(ws: Workspace): CorrectionCase | null {
  return ws.cases.find((entry) => entry.source_ref === CASE_REF) ?? null;
}

export function initialPublicationCase(ws: Workspace): CorrectionCase | null {
  return ws.cases.find((entry) => entry.source_ref === INITIAL_PUBLICATION_REF) ?? null;
}

/**
 * True while an authoring-start workspace has no edition yet. The desk then
 * shows authoring and the initial publication instead of a published package.
 */
export function authoringOpen(ws: Workspace): boolean {
  return initialPublicationCase(ws) !== null && ws.current_release === null;
}

/**
 * A plan the server retired: rejected by its reviewer, or invalidated because
 * the world moved after staging. Its case is open again for a new version.
 */
export function planRetired(plan: PlanSummary | null): boolean {
  return plan?.status === "INVALIDATED" || plan?.status === "REJECTED";
}

/** A fresh idempotency key per attempt, so a restage never replays a retired plan. */
export function stagingAttempt(kase: CorrectionCase): number {
  return kase.plans.length + 1;
}

export function latestPlanSummary(kase: CorrectionCase | null): PlanSummary | null {
  if (!kase || kase.plans.length === 0) return null;
  return kase.plans.reduce((best, plan) => (plan.version > best.version ? plan : best));
}

/**
 * A registered use is contradicted only when an edition actually published an
 * assertion for it and current evidence differs. Before the first edition there
 * is nothing published to contradict.
 */
export function contradicted(entry: Assessment | null | undefined): boolean {
  if (!entry || entry.previous?.relation === undefined) return false;
  return entry.relation_changed || entry.magnitude_changed;
}

/** True once the correction's batches actually sit in the new lane. */
export function correctionCommitted(ws: Workspace, kase: CorrectionCase | null): boolean {
  if (!kase || kase.changed_batch_ids.length === 0) return false;
  const batches = ws.evidence?.batches ?? [];
  return kase.changed_batch_ids.every(
    (id) => batches.find((batch) => batch.batch_id === id)?.lane_id === kase.to_lane_id,
  );
}

/** The plan is assigned to someone who no longer holds the case. */
export function assignedReviewerIsStale(ws: Workspace, plan: Plan | null): boolean {
  if (!plan?.assigned_reviewer_id) return false;
  const current = ws.decision?.current_reviewer_id ?? null;
  return current !== null && current !== plan.assigned_reviewer_id;
}

/**
 * Where the case is, as the backend's own state defines it.
 *
 * `reachable` is the furthest panel the data makes sense to show; `fallback` is
 * where the view sits when the viewer has not chosen one. The difference is the
 * design's "next step" button: the panel after this one exists and can be read,
 * but nothing has happened there yet.
 */
export interface StepState {
  reachable: Step;
  fallback: Step;
}

export function stepState(ws: Workspace, plan: Plan | null): StepState {
  const kase = activeCase(ws);
  if (!kase) return { reachable: 1, fallback: 1 };

  const plans = kase.plans;
  const issued = plan?.status === "ISSUED" || plans.some((entry) => entry.status === "ISSUED");
  if (issued) return { reachable: 7, fallback: 7 };

  // Only a reviewer-only refresh supersedes a plan for AUTHORITY_CHANGED; a
  // restage after a rejection or an invalidation is an ordinary new review.
  const refreshed = plans.some(
    (entry) => entry.status === "SUPERSEDED" && entry.invalidation_reason === "AUTHORITY_CHANGED",
  );
  const staleAuthority =
    plan?.status === "STALE_AUTHORITY" || plans.some((entry) => entry.status === "STALE_AUTHORITY");
  if (refreshed || staleAuthority) return { reachable: 7, fallback: 6 };

  if (plan && assignedReviewerIsStale(ws, plan)) return { reachable: 6, fallback: 5 };
  if (plan?.status === "APPROVED") return { reachable: 5, fallback: 4 };
  if (plan) return { reachable: 4, fallback: 3 };

  return correctionCommitted(ws, kase)
    ? { reachable: 3, fallback: 2 }
    : { reachable: 2, fallback: 1 };
}

export function focusForStep(step: Step, correctionPending: boolean): Focus {
  switch (step) {
    case 2:
      return correctionPending ? "evidence" : "overview";
    case 4:
      return "review";
    case 5:
    case 6:
      return "authority";
    default:
      return "overview";
  }
}

/** Dollars from exact cents the server computed. The browser divides nothing else. */
export function money(cents: number): string {
  const sign = cents < 0 ? "-" : "";
  const abs = Math.abs(cents);
  return `${sign}$${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, "0")}`;
}

export const RELATION_PHRASE: Record<string, string> = {
  LOWER_COST: "cheaper",
  HIGHER_COST: "more expensive",
  EQUAL_COST: "equal",
  WITHHELD: "withheld",
};

/** The plain words for the typed goal the agent read from a request. */
export const GOAL_LABEL: Record<string, string> = {
  CORRECT_FACTS: "correct the published facts",
  PRESERVE_PROPOSAL: "keep the proposal open for review",
  RETAIN_CHEAPER_CLAIM: "keep the cheaper claim",
  UNKNOWN: "unclear",
};

/** The plain words for a plan's typed decision disposition. */
export const DISPOSITION_LABEL: Record<string, string> = {
  RETURN_FOR_REVIEW: "return the proposal for review",
  HOLD_FOR_CLARIFICATION: "hold the proposal for clarification",
  NO_CHANGE: "leave the proposal unchanged",
};

export const goalLabel = (goal: string): string => GOAL_LABEL[goal] ?? goal.toLowerCase();
export const dispositionLabel = (disposition: string): string =>
  DISPOSITION_LABEL[disposition] ?? disposition.replace(/_/g, " ").toLowerCase();

/** A case whose revision has been issued. Its history is read, not acted on. */
export const caseFinished = (kase: CorrectionCase | null): boolean => kase?.status === "ISSUED";

export const titleCase = (value: string): string =>
  value.replace(/_/g, " ").toLowerCase().replace(/^./, (c) => c.toUpperCase());
