import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import ReviewStage from "../src/components/stages/ReviewStage";
import type { StageContext } from "../src/components/stages/context";
import type { Actor, Plan } from "../src/types";
import { WORKSPACE_AGENT_STAGED } from "./fixtures";

/**
 * Acknowledging a proposed alternative is something one person does to one
 * exact plan version. The server records it on that approval, so a tick left
 * behind by a previous identity — or by a previous plan version — must never
 * travel into the next approval request.
 */

const noor: Actor = {
  person_id: "person-noor",
  display_name: "Noor Haddad",
  demo_role: "reviewer",
  review_capable: true,
};

const sam: Actor = {
  person_id: "person-sam",
  display_name: "Sam Oyelaran",
  demo_role: "reviewer",
  review_capable: true,
};

function plan(over: Partial<Plan> = {}): Plan {
  return {
    plan_id: "plan-case-dispatch-b09-b11-v1",
    version: 1,
    status: "AWAITING_REVIEW",
    raw_request: "Update the reports, but keep South as the cheaper option in the rollout memo.",
    goal: "RETAIN_CHEAPER_CLAIM",
    alternative_flag: true,
    disposition: "RETURN_FOR_REVIEW",
    note: "",
    content_hash: "c".repeat(64),
    execution_fingerprint: "e".repeat(64),
    candidates: {
      "doc-operations-cost-review": "a".repeat(64),
      "doc-south-expansion-memo": "b".repeat(64),
    },
    scope: null,
    context_revision: 3,
    prior_release_id: "rel-1",
    staged_at: "2026-10-15T10:00:00Z",
    staged_by: "person-ari",
    approved_at: null,
    acknowledged_alternative: null,
    invalidation_reason: null,
    superseded_by: null,
    case_id: "case-dispatch-b09-b11",
    approved_by: null,
    assigned_reviewer_id: "person-noor",
    assigned_reviewer_name: "Noor Haddad",
    covered_occurrence_ids: ["occ-ops-cost-finding", "occ-memo-cost-finding"],
    ...over,
  } as Plan;
}

function context(over: Partial<StageContext> = {}): StageContext {
  return {
    workspace: WORKSPACE_AGENT_STAGED,
    actor: noor,
    readiness: null,
    kase: WORKSPACE_AGENT_STAGED.cases.find((entry) => entry.source_ref === "DX-2026-0914") ?? null,
    plan: plan(),
    priorPlan: null,
    previousComparison: null,
    busy: false,
    step: 4,
    serverStep: 4,
    currentStep: 4,
    goTo: vi.fn(),
    commit: vi.fn(async (action: () => Promise<unknown>) => action()) as StageContext["commit"],
    focusNode: vi.fn(),
    openViewer: vi.fn(),
    refusal: null,
    dismissRefusal: vi.fn(),
    notify: vi.fn(),
    ...over,
  };
}

const checkbox = () =>
  screen.getByRole("checkbox", { name: /I acknowledge the proposed alternative/ });

describe("the alternative acknowledgement", () => {
  it("resets when the signed-in actor changes", () => {
    const { rerender } = render(<ReviewStage context={context({ actor: noor })} />);

    fireEvent.click(checkbox());
    expect((checkbox() as HTMLInputElement).checked).toBe(true);

    // The same plan, a different person at the keyboard.
    rerender(<ReviewStage context={context({ actor: sam })} />);

    expect((checkbox() as HTMLInputElement).checked).toBe(false);

    // And it stays cleared on returning: the tick is discarded, not hidden.
    rerender(<ReviewStage context={context({ actor: noor })} />);

    expect((checkbox() as HTMLInputElement).checked).toBe(false);
  });

  it("resets when the plan version changes", () => {
    const { rerender } = render(<ReviewStage context={context()} />);

    fireEvent.click(checkbox());
    expect((checkbox() as HTMLInputElement).checked).toBe(true);

    // A reviewer-only refresh keeps the bytes but creates a new plan version.
    rerender(
      <ReviewStage
        context={context({
          plan: plan({
            plan_id: "plan-case-dispatch-b09-b11-v2",
            version: 2,
            assigned_reviewer_id: "person-sam",
            assigned_reviewer_name: "Sam Oyelaran",
          }),
        })}
      />,
    );

    expect((checkbox() as HTMLInputElement).checked).toBe(false);
  });

  it("keeps the tick while the same person reviews the same plan", () => {
    const { rerender } = render(<ReviewStage context={context()} />);

    fireEvent.click(checkbox());
    // An unrelated refetch: same actor, same plan version.
    rerender(<ReviewStage context={context({ busy: true })} />);

    expect((checkbox() as HTMLInputElement).checked).toBe(true);
  });

  it("sends the acknowledgement the current actor actually gave", () => {
    const commit = vi.fn(async (action: () => Promise<unknown>) => action());
    const { rerender } = render(
      <ReviewStage context={context({ actor: noor, commit: commit as StageContext["commit"] })} />,
    );

    fireEvent.click(checkbox());
    rerender(
      <ReviewStage context={context({ actor: sam, commit: commit as StageContext["commit"] })} />,
    );
    fireEvent.click(screen.getByRole("button", { name: /Approve revision as Sam Oyelaran/ }));

    // The request must not carry Noor's tick on Sam's behalf.
    expect(commit).toHaveBeenCalledTimes(1);
    expect((checkbox() as HTMLInputElement).checked).toBe(false);
  });
});
