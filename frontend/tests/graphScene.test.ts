import { describe, expect, it } from "vitest";

import { edgeDefs, edgeTarget, makeLabel, nodeText, placeLabel } from "../src/graph/graph-scene";
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
  it("labels a retired plan as invalidated, never as awaiting", () => {
    const stage = { ...stageFromWorkspace(WORKSPACE_CORRECTED, null, "review"), plan: "v1-retired" as const };
    const text = nodeText({ id: "plan", type: "plan" }, stage);
    expect(text.sub).toBe("retired · can no longer be approved");
    expect(text.tag).toEqual(["INVALIDATED", "coral"]);
  });

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

describe("graph label placement", () => {
  // The 1920 x 1080 canvas left of the panel, above the comparison strip.
  const bounds = { left: 8, top: 136, right: 1348, bottom: 1072, floor: 920 };
  const reviewerLabel = (anchor: "right" = "right") => {
    const label = makeLabel({ type: "person", label: "Noor Haddad", anchor, fallback: "below" }, document.createElement("div"));
    label.w = 225;
    label.h = 60;
    return label;
  };

  it("keeps a reviewer label to the right of its marker when it fits", () => {
    const label = reviewerLabel();
    placeLabel(label, "right", 1063, 640, bounds);
    expect(label.el.style.transform).toBe("translate(1087px,610px)");
    expect(label.el.style.textAlign).toBe("left");
  });

  it("moves a reviewer label below its marker rather than over it at the panel edge", () => {
    const label = reviewerLabel();
    placeLabel(label, "right", 1178, 630, bounds);
    expect(label.el.style.transform).toBe("translate(1065.5px,654px)");
    expect(label.el.style.textAlign).toBe("center");
  });

  it("never moves a reviewer label down into the comparison strip", () => {
    const label = reviewerLabel();
    placeLabel(label, "right", 1178, 880, bounds);
    expect(label.el.style.textAlign).toBe("left");
  });

  it("leaves labels without a fallback side where they were", () => {
    const label = makeLabel({ type: "release", label: "Current release", anchor: "right" }, document.createElement("div"));
    label.w = 225;
    label.h = 60;
    placeLabel(label, "right", 1178, 630, bounds);
    expect(label.el.style.transform).toBe("translate(1123px,600px)");
    expect(label.el.style.textAlign).toBe("left");
  });
});
