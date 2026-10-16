import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import DeskStage from "../src/components/stages/DeskStage";
import type { StageContext } from "../src/components/stages/context";
import type { Actor, Plan, PlanSummary, Workspace } from "../src/types";
import { planRetired, stepState } from "../src/workflow";
import { WORKSPACE_PLACED_NO_BASIS } from "./authoringFixtures";
import { WORKSPACE_CORRECTED } from "./fixtures";

/**
 * A plan the server retired leaves the case open for a new version. The page
 * shows why, offers the ordinary staging step again, and never treats the
 * restaged version as a reviewer-only refresh.
 */

const ari: Actor = {
  person_id: "person-ari",
  display_name: "Ari Mensah",
  demo_role: "analyst",
  review_capable: false,
};

function plan(caseId: string, version: number, status: string, reason: string | null): PlanSummary {
  return {
    plan_id: `plan-${caseId}-v${version}`,
    version,
    status,
    content_hash: "0".repeat(64),
    execution_fingerprint: String(version).repeat(64),
    invalidation_reason: reason,
    approved_by: status === "INVALIDATED" ? "person-noor" : null,
    goal: "CORRECT_FACTS",
    alternative_flag: false,
    disposition: "NO_CHANGE",
    note: "",
    staged_by: "person-ari",
    assigned_reviewer_id: "person-noor",
  };
}

/** The plan record the app reads back for a summary, as the server returns it. */
function record(summary: PlanSummary, caseId: string): Plan {
  return {
    ...summary,
    raw_request: "",
    candidates: {},
    scope: null,
    context_revision: 3,
    prior_release_id: "rel-001-c004be61",
    staged_at: "2026-10-16T10:00:00Z",
    approved_at: null,
    acknowledged_alternative: null,
    superseded_by: null,
    case_id: caseId,
    assigned_reviewer_name: "Noor Haddad",
    covered_occurrence_ids: [],
  };
}

function withPlans(workspace: Workspace, sourceRef: string, plans: PlanSummary[]): Workspace {
  return {
    ...workspace,
    cases: workspace.cases.map((kase) =>
      kase.source_ref === sourceRef
        ? { ...kase, status: plans.at(-1)?.status === "INVALIDATED" ? "NEEDS_CHANGES" : "AWAITING_REVIEW", plans }
        : kase,
    ),
  };
}

function context(workspace: Workspace): StageContext {
  return {
    workspace,
    actor: ari,
    readiness: null,
    kase: null,
    plan: null,
    priorPlan: null,
    previousComparison: null,
    busy: false,
    step: 1,
    serverStep: 2,
    currentStep: 1,
    goTo: vi.fn(),
    commit: vi.fn(async (action: () => Promise<unknown>) => action()) as StageContext["commit"],
    focusNode: vi.fn(),
    openViewer: vi.fn(),
    refusal: null,
    dismissRefusal: vi.fn(),
    notify: vi.fn(),
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("a retired plan", () => {
  it("is recognised whether it was rejected or invalidated", () => {
    expect(planRetired(plan("c", 1, "INVALIDATED", "STALE_PLAN"))).toBe(true);
    expect(planRetired(plan("c", 1, "REJECTED", "wrong scope"))).toBe(true);
    expect(planRetired(plan("c", 1, "APPROVED", null))).toBe(false);
  });

  it("routes a restaged version to ordinary review, not to a fresh-authority refresh", () => {
    const caseId = "case-dispatch-b09-b11";
    const restaged = withPlans(WORKSPACE_CORRECTED, "DX-2026-0914", [
      plan(caseId, 1, "INVALIDATED", "STALE_CONTEXT"),
      plan(caseId, 2, "AWAITING_REVIEW", null),
    ]);
    const restagedPlan = restaged.cases.find((k) => k.case_id === caseId)!.plans[1];
    expect(stepState(restaged, record(restagedPlan, caseId))).toEqual({
      reachable: 4,
      fallback: 3,
    });

    const refreshed = withPlans(WORKSPACE_CORRECTED, "DX-2026-0914", [
      plan(caseId, 1, "SUPERSEDED", "AUTHORITY_CHANGED"),
      plan(caseId, 2, "AWAITING_REVIEW", null),
    ]);
    const refreshedPlan = refreshed.cases.find((k) => k.case_id === caseId)!.plans[1];
    expect(stepState(refreshed, record(refreshedPlan, caseId))).toEqual({
      reachable: 7,
      fallback: 6,
    });
  });

  it("offers the initial publication again, with a new attempt key", async () => {
    const calls: { url: string; body: unknown }[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        calls.push({ url: String(input), body: init?.body ? JSON.parse(String(init.body)) : undefined });
        return new Response("{}", { status: 200 });
      }),
    );
    const claimId = WORKSPACE_PLACED_NO_BASIS.findings![0].claim_id;
    const authored: Workspace = {
      ...WORKSPACE_PLACED_NO_BASIS,
      decision: { ...WORKSPACE_PLACED_NO_BASIS.decision!, basis_claim_id: claimId },
    };
    const caseId = "case-initial-publication";
    const workspace = withPlans(authored, "INITIAL-PUBLICATION", [
      plan(caseId, 1, "INVALIDATED", "STALE_PLAN"),
    ]);

    render(<DeskStage context={context(workspace)} />);

    expect(screen.getByText(/Plan v1 invalidated/)).toBeTruthy();
    expect(screen.getByText(/STALE_PLAN/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Approve revision/ })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /Prepare initial publication/ }));
    await vi.waitFor(() => expect(calls).toHaveLength(1));
    expect(calls[0].url).toMatch(new RegExp(`/cases/${caseId}/stage-review$`));
    expect((calls[0].body as { idempotency_key: string }).idempotency_key).toBe(
      `initial-publication-rev-${workspace.context_revision}-2`,
    );
  });
});
