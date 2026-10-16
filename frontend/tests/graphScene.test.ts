import { describe, expect, it } from "vitest";

import { edgeDefs, edgeTarget, nodeText } from "../src/graph/graph-scene";
import { stageFromWorkspace } from "../src/graph/stageFromWorkspace";
import { WORKSPACE_CORRECTED, WORKSPACE_V1 } from "./fixtures";

/**
 * The real scene derivation, run on stages built from recorded responses. A tag
 * or an edge in the picture must be something the server actually reported.
 */

const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

const comparisonTag = (stage: ReturnType<typeof stageFromWorkspace>) =>
  nodeText({ id: "comparison", type: "comparison" }, stage).tag;

describe("graph scene derivation", () => {
  it("tags a reversed direction only when the relation changed", () => {
    const stage = stageFromWorkspace(WORKSPACE_CORRECTED, null, "overview");
    expect(stage.reversed).toBe(true);
    expect(comparisonTag(stage)).toEqual(["DIRECTION REVERSED", "coral"]);
  });

  it("never calls a magnitude-only change a reversal", () => {
    const ws = clone(WORKSPACE_CORRECTED);
    ws.assessment = ws.assessment.map((entry) => ({
      ...entry,
      relation_changed: false,
      magnitude_changed: true,
    }));
    const stage = stageFromWorkspace(ws, null, "overview");

    expect(stage.stale).toBe(true);
    expect(stage.reversed).toBe(false);
    expect(comparisonTag(stage)).toEqual(["VALUE CHANGED", "coral"]);
  });

  it("draws no release edge before any release exists", () => {
    const ws = clone(WORKSPACE_V1);
    ws.current_release = null;
    const stage = stageFromWorkspace(ws, null, "overview");
    const releaseEdges = edgeDefs(stage).filter((edge) => edge.kind === "release");

    expect(releaseEdges.length).toBeGreaterThan(0);
    expect(releaseEdges.every((edge) => !edgeTarget(edge, stage).vis)).toBe(true);
  });

  it("draws the release edges once a release is current", () => {
    const stage = stageFromWorkspace(WORKSPACE_V1, null, "overview");
    const releaseEdges = edgeDefs(stage).filter((edge) => edge.kind === "release");

    expect(releaseEdges.every((edge) => edgeTarget(edge, stage).vis)).toBe(true);
  });
});
