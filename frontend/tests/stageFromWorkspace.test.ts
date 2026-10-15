import { describe, expect, it } from "vitest";

import { stageFromWorkspace } from "../src/graph/stageFromWorkspace";
import type { Plan } from "../src/types";
import { WORKSPACE_AGENT_STAGED, WORKSPACE_CORRECTED, WORKSPACE_V1 } from "./fixtures";

/**
 * The scene stage is derived from recorded backend responses. These tests are
 * the guard on the rule that matters most: nothing in the picture may be a
 * literal, and unknown review authority may never resolve to a person.
 */

const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

const plan = (over: Partial<Plan> = {}): Plan =>
  ({
    plan_id: "plan-case-dispatch-b09-b11-v1",
    version: 1,
    status: "AWAITING_REVIEW",
    raw_request: "",
    goal: "RETAIN_CHEAPER_CLAIM",
    alternative_flag: true,
    disposition: "RETURN_FOR_REVIEW",
    note: "",
    content_hash: "c".repeat(64),
    execution_fingerprint: "e".repeat(64),
    candidates: { "doc-operations-cost-review": "a".repeat(64), "doc-south-expansion-memo": "b".repeat(64) },
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
  }) as Plan;

describe("stageFromWorkspace", () => {
  it("reads the published state from the Version 1 workspace", () => {
    const stage = stageFromWorkspace(WORKSPACE_V1, null, "overview");

    expect(stage.moved).toBe(false);
    expect(stage.stale).toBe(false);
    expect(stage.caseVis).toBe(true);
    expect(stage.plan).toBe("none");
    expect(stage.release).toBe("v1");
    expect(stage.reviewer).toBe("noor");
    expect(stage.authorityKnown).toBe(true);
    expect(stage.batches).toHaveLength(15);
    expect(stage.changedBatchIds).toEqual(["B09", "B10", "B11"]);
    expect(stage.fromLaneKey).toBe("south");
    expect(stage.toLaneKey).toBe("pilot");
  });

  it("takes every number and name from the response, never from a literal", () => {
    const stage = stageFromWorkspace(WORKSPACE_V1, null, "overview");

    expect(stage.facts).toEqual({
      leftLaneKey: "north",
      rightLaneKey: "south",
      leftLaneName: "North",
      rightLaneName: "South",
      leftMeanCents: 400,
      rightMeanCents: 360,
      leftCount: 4,
      rightCount: 7,
      relation: "LOWER_COST",
      magnitudeCents: 40,
    });
    expect(stage.labels.docOpsTitle).toBe("Operations Cost Review");
    expect(stage.labels.docMemoOwner).toBe("Sam Oyelaran");
    expect(stage.labels.currentReviewerName).toBe("Noor Haddad");
    expect(stage.labels.editionLabel).toBe("Version 1");
  });

  it("follows the committed memberships after the correction", () => {
    const stage = stageFromWorkspace(WORKSPACE_CORRECTED, null, "overview");

    expect(stage.moved).toBe(true);
    expect(stage.stale).toBe(true);
    for (const id of ["B09", "B10", "B11"]) {
      const batch = stage.batches.find((b) => b.id === id);
      expect(batch?.currentLane).toBe("pilot");
      // Only the case records where a corrected batch came from.
      expect(batch?.originalLane).toBe("south");
    }
    expect(stage.batches.find((b) => b.id === "B05")?.currentLane).toBe("south");
    expect(stage.facts?.rightMeanCents).toBe(440);
    expect(stage.facts?.rightCount).toBe(4);
    expect(stage.facts?.relation).toBe("HIGHER_COST");
  });

  it("does not animate a correction the evidence has not committed", () => {
    const ws = clone(WORKSPACE_CORRECTED);
    const target = ws.evidence!.batches.find((b) => b.batch_id === "B09")!;
    target.lane_id = "lane-south";

    expect(stageFromWorkspace(ws, null, "overview").moved).toBe(false);
  });

  it("reports unknown review authority instead of falling back to a person", () => {
    const ws = clone(WORKSPACE_V1);
    ws.decision!.current_reviewer_id = null;
    ws.decision!.current_reviewer_name = null;

    const stage = stageFromWorkspace(ws, null, "overview");

    expect(stage.authorityKnown).toBe(false);
    expect(stage.reviewer).toBe("unknown");
    expect(stage.reviewer).not.toBe("noor");
  });

  it("reports an unmapped reviewer id as unknown", () => {
    const ws = clone(WORKSPACE_V1);
    ws.decision!.current_reviewer_id = "person-someone-else";
    ws.decision!.current_reviewer_name = "Someone Else";

    const stage = stageFromWorkspace(ws, null, "overview");

    expect(stage.authorityKnown).toBe(false);
    expect(stage.reviewer).toBe("unknown");
  });

  it("follows the reviewer the graph currently names", () => {
    const ws = clone(WORKSPACE_CORRECTED);
    ws.decision!.current_reviewer_id = "person-sam";
    ws.decision!.current_reviewer_name = "Sam Oyelaran";

    const stage = stageFromWorkspace(ws, null, "authority");

    expect(stage.reviewer).toBe("sam");
    expect(stage.authorityKnown).toBe(true);
    expect(stage.labels.currentReviewerName).toBe("Sam Oyelaran");
  });

  it("maps each plan status to its own slot and never invents an approval", () => {
    const ws = WORKSPACE_AGENT_STAGED;
    const first = ws.cases.find((c) => c.source_ref === "DX-2026-0914")!.plans;

    expect(stageFromWorkspace(ws, plan({ status: "AWAITING_REVIEW" }), "review").plan).toBe("v1-assigned");
    expect(stageFromWorkspace(ws, plan({ status: "APPROVED" }), "review").plan).toBe("v1-approved");
    expect(stageFromWorkspace(ws, plan({ status: "STALE_AUTHORITY" }), "authority").plan).toBe("v1-invalid");
    expect(stageFromWorkspace(ws, plan({ status: "REJECTED" }), "review").plan).toBe("v1-assigned");
    expect(first.length).toBeGreaterThan(0);
  });

  it("puts a refreshed plan in the second slot and follows its assigned reviewer", () => {
    const ws = clone(WORKSPACE_AGENT_STAGED);
    const kase = ws.cases.find((c) => c.source_ref === "DX-2026-0914")!;
    const v1 = kase.plans[kase.plans.length - 1];
    kase.plans.push({ ...v1, plan_id: `${v1.plan_id}-v2`, version: v1.version + 1, status: "AWAITING_REVIEW" });

    const stage = stageFromWorkspace(
      ws,
      plan({
        version: v1.version + 1,
        status: "AWAITING_REVIEW",
        assigned_reviewer_id: "person-sam",
        assigned_reviewer_name: "Sam Oyelaran",
      }),
      "authority",
    );

    expect(stage.plan).toBe("v2-assigned");
    expect(stage.planReviewerKey).toBe("sam");
    expect(stage.labels.planReviewerName).toBe("Sam Oyelaran");
  });

  it("distinguishes no release at all from Version 1", () => {
    const ws = clone(WORKSPACE_V1);
    ws.current_release = null;

    expect(stageFromWorkspace(ws, null, "overview").release).toBe("none");
    expect(stageFromWorkspace(ws, null, "overview").labels.editionLabel).toBe("not yet issued");
  });

  it("reads a corrected release as Version 2", () => {
    const ws = clone(WORKSPACE_CORRECTED);
    ws.current_release!.sequence = 2;

    expect(stageFromWorkspace(ws, null, "overview").release).toBe("v2");
  });

  it("survives a workspace with no evidence, comparison or decision", () => {
    const ws = clone(WORKSPACE_V1);
    ws.evidence = null;
    ws.comparison = null;
    ws.decision = null;

    const stage = stageFromWorkspace(ws, null, "overview");

    expect(stage.facts).toBeNull();
    expect(stage.batches).toEqual([]);
    expect(stage.moved).toBe(false);
    expect(stage.authorityKnown).toBe(false);
  });
});
