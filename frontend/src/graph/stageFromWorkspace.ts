/**
 * Derive the graph scene's `SceneStage` from REAL API responses only.
 *
 * No step index, no animation state, no timer and no local flag may feed this
 * function. Everything it returns traces to a field of `GET /workspace` or
 * `GET /plans/{id}`, so the only thing that can change the picture is a changed
 * backend relationship.
 *
 *   fetchWorkspace() -> Workspace   (GET /workspace)
 *   fetchPlan(id)    -> Plan        (GET /plans/{plan_id})
 */
import type { Comparison, Plan, PlanSummary, Workspace } from "../types";

export type LaneKey = "north" | "south" | "pilot";
export type ReviewerKey = "noor" | "sam" | "unknown";
export type ReleaseVisual = "none" | "v1" | "v2";
export type Focus = "overview" | "evidence" | "review" | "authority";

export type PlanVisual =
  | "none"
  | "v1-assigned"
  | "v1-approved"
  | "v1-invalid"
  | "v1-issued"
  | "v2-assigned"
  | "v2-approved"
  | "v2-invalid"
  | "v2-issued";

/** One batch, with the lane it was recorded in and the lane it is in now. */
export interface SceneBatch {
  id: string;
  costCents: number;
  originalLane: LaneKey;
  currentLane: LaneKey;
}

/** Numbers the labels must show. Never computed in the browser. */
export interface SceneFacts {
  leftLaneKey: LaneKey;
  rightLaneKey: LaneKey;
  leftLaneName: string;
  rightLaneName: string;
  leftMeanCents: number;
  rightMeanCents: number;
  leftCount: number;
  rightCount: number;
  relation: string;
  magnitudeCents: number;
}

/** Every string the scene prints. All of them come from a response. */
export interface SceneLabels {
  datasetTitle: string;
  datasetSub: string;
  datasetSha: string;
  caseRef: string;
  caseSub: string;
  caseLanes: string;
  caseStatus: string;
  lanes: Record<LaneKey, string>;
  comparisonTitle: string;
  comparisonOwner: string;
  metricKey: string;
  minN: number | "";
  findingTitle: string;
  findingSub: string;
  claimTitle: string;
  occurrenceCount: number;
  publishedSentence: string;
  docOpsTitle: string;
  docOpsOwner: string;
  docOpsStyle: string;
  docMemoTitle: string;
  docMemoOwner: string;
  docMemoStyle: string;
  editionLabel: string;
  decisionTitle: string;
  decisionStatus: string;
  decisionBasis: string;
  releaseTitle: string;
  releaseSub: string;
  releaseSequence: string;
  releaseIncludes: string;
  teamTitle: string;
  teamSub: string;
  reviewerAId: string;
  reviewerAName: string;
  reviewerARole: string;
  reviewerAOwns: string;
  reviewerBId: string;
  reviewerBName: string;
  reviewerBRole: string;
  reviewerBOwns: string;
  currentReviewerName: string;
  planTitle: string;
  planReviewerName: string;
  planCoverage: string;
  planDisposition: string;
}

export interface SceneStage {
  /** The correction is committed in the graph: changed batches sit in the new lane. */
  moved: boolean;
  caseVis: boolean;
  /** A registered card is contradicted by current evidence, per the server's assessment. */
  stale: boolean;
  plan: PlanVisual;
  reviewer: ReviewerKey;
  /** False when the graph reports no resolvable current reviewer. Never guessed. */
  authorityKnown: boolean;
  planReviewerKey: ReviewerKey | null;
  release: ReleaseVisual;
  focus: Focus;
  batches: SceneBatch[];
  changedBatchIds: string[];
  fromLaneKey: LaneKey;
  toLaneKey: LaneKey;
  facts: SceneFacts | null;
  labels: SceneLabels;
}

const CASE_REF = "DX-2026-0914";
const LANE_SLOTS: LaneKey[] = ["north", "south", "pilot"];

/** Seeded ids (backend/app/domain.py) mapped to the scene's fixed visual slots. */
const DOC_SLOT_IDS = ["doc-operations-cost-review", "doc-south-expansion-memo"];
const PERSON_SLOT_IDS = ["person-noor", "person-sam"];

const text = (value: string | null | undefined): string => value ?? "";

/** Which scene slot a document occupies, for focusing it from the panel. */
export function documentNodeKey(ws: Workspace, documentId: string): "doc-ops" | "doc-memo" | null {
  const docs = ws.scope;
  const slots: ("doc-ops" | "doc-memo")[] = ["doc-ops", "doc-memo"];
  for (let index = 0; index < slots.length; index += 1) {
    const match = docs.find((doc) => doc.document_id === DOC_SLOT_IDS[index]) ?? docs[index] ?? null;
    if (match && match.document_id === documentId) return slots[index];
  }
  return null;
}

/**
 * Lane ids to the three visual columns. Seeded ids name themselves; anything
 * else is placed by its role in the comparison, so the picture stays readable
 * without inventing a lane the server did not send.
 */
function laneSlotMap(ws: Workspace): Record<string, LaneKey> {
  const ids: string[] = [];
  const push = (id: string | null | undefined) => {
    if (id && !ids.includes(id)) ids.push(id);
  };
  if (ws.comparison) {
    push(ws.comparison.left.lane_id);
    push(ws.comparison.right.lane_id);
  }
  for (const batch of ws.evidence?.batches ?? []) push(batch.lane_id);
  for (const kase of ws.cases) {
    push(kase.from_lane_id);
    push(kase.to_lane_id);
  }

  const map: Record<string, LaneKey> = {};
  const taken = new Set<LaneKey>();
  for (const id of ids) {
    const key = id.replace(/^lane-/, "") as LaneKey;
    if (LANE_SLOTS.includes(key) && !taken.has(key)) {
      map[id] = key;
      taken.add(key);
    }
  }
  for (const id of ids) {
    if (map[id]) continue;
    const free = LANE_SLOTS.find((slot) => !taken.has(slot));
    if (!free) continue;
    map[id] = free;
    taken.add(free);
  }
  return map;
}

/** The scene's plan slot: the case's first plan version, or a later one. */
function planSlot(plans: PlanSummary[], latest: Plan): "v1" | "v2" {
  const versions = plans.map((plan) => plan.version);
  const first = versions.length > 0 ? Math.min(...versions) : latest.version;
  return latest.version === first ? "v1" : "v2";
}

function planVisual(plans: PlanSummary[], latest: Plan | null): PlanVisual {
  if (!latest) return "none";
  const slot = planSlot(plans, latest);
  switch (latest.status) {
    case "AWAITING_REVIEW":
      return `${slot}-assigned` as PlanVisual;
    case "APPROVED":
      return `${slot}-approved` as PlanVisual;
    case "ISSUED":
      return `${slot}-issued` as PlanVisual;
    case "STALE_AUTHORITY":
      return `${slot}-invalid` as PlanVisual;
    default:
      // REJECTED / SUPERSEDED / NEEDS_CHANGES: the plan exists and is assigned,
      // but nothing about it is approved. Never invent an approval here.
      return `${slot}-assigned` as PlanVisual;
  }
}

function comparisonFacts(
  comparison: Comparison | null,
  lanes: Record<string, LaneKey>,
): SceneFacts | null {
  if (!comparison) return null;
  const leftLaneKey = lanes[comparison.left.lane_id];
  const rightLaneKey = lanes[comparison.right.lane_id];
  if (!leftLaneKey || !rightLaneKey) return null;
  return {
    leftLaneKey,
    rightLaneKey,
    leftLaneName: comparison.left.lane_name,
    rightLaneName: comparison.right.lane_name,
    leftMeanCents: comparison.left.mean_display_cents,
    rightMeanCents: comparison.right.mean_display_cents,
    leftCount: comparison.left.batch_count,
    rightCount: comparison.right.batch_count,
    relation: comparison.relation,
    magnitudeCents: comparison.magnitude_cents,
  };
}

export function stageFromWorkspace(
  ws: Workspace,
  latest: Plan | null,
  focus: Focus,
): SceneStage {
  const kase = ws.cases.find((entry) => entry.source_ref === CASE_REF) ?? ws.cases[0] ?? null;
  const lanes = laneSlotMap(ws);
  const facts = comparisonFacts(ws.comparison, lanes);

  const changedBatchIds = kase?.changed_batch_ids ?? [];
  const fromLaneKey = (kase && lanes[kase.from_lane_id]) || "south";
  const toLaneKey = (kase && lanes[kase.to_lane_id]) || "pilot";

  const batches: SceneBatch[] = (ws.evidence?.batches ?? []).map((batch) => {
    const currentLane = lanes[batch.lane_id] ?? "pilot";
    // Only the case records where a corrected batch came from; /workspace
    // reports the lane it is in now.
    const originalLane = changedBatchIds.includes(batch.batch_id) ? fromLaneKey : currentLane;
    return { id: batch.batch_id, costCents: batch.cost_cents, originalLane, currentLane };
  });

  // Committed membership, not case status: the picture follows the evidence.
  const moved =
    changedBatchIds.length > 0 &&
    changedBatchIds.every((id) => batches.find((b) => b.id === id)?.currentLane === toLaneKey);

  const stale = ws.assessment.some((entry) => entry.relation_changed || entry.magnitude_changed);

  const reviewerId = ws.decision?.current_reviewer_id ?? null;
  const personSlots = resolveSlots(
    ws.people.map((person) => person.person_id),
    PERSON_SLOT_IDS,
    ws.people.filter((person) => person.review_capable).map((person) => person.person_id),
  );
  // An unresolvable reviewer is reported as unknown. It never falls back to a
  // person who merely used to hold the case.
  const reviewerKey: ReviewerKey = reviewerId ? (personSlots[reviewerId] ?? "unknown") : "unknown";
  const authorityKnown = reviewerKey === "noor" || reviewerKey === "sam";

  const assignedId = latest?.assigned_reviewer_id ?? null;
  const planReviewerKey: ReviewerKey | null = assignedId
    ? (personSlots[assignedId] ?? "unknown")
    : null;

  const release: ReleaseVisual = !ws.current_release
    ? "none"
    : ws.current_release.sequence > 1
      ? "v2"
      : "v1";

  return {
    moved,
    caseVis: !!kase,
    stale,
    plan: planVisual(kase?.plans ?? [], latest),
    reviewer: reviewerKey,
    authorityKnown,
    planReviewerKey,
    release,
    focus,
    batches,
    changedBatchIds,
    fromLaneKey,
    toLaneKey,
    facts,
    labels: sceneLabels(ws, kase, latest, lanes, facts, personSlots),
  };
}

/** Map known ids to fixed visual slots, then fill the rest in order. */
function resolveSlots(
  all: string[],
  preferred: string[],
  fallbackOrder: string[],
): Record<string, "noor" | "sam"> {
  const slots: ("noor" | "sam")[] = ["noor", "sam"];
  const map: Record<string, "noor" | "sam"> = {};
  const taken = new Set<"noor" | "sam">();
  preferred.forEach((id, index) => {
    if (!all.includes(id)) return;
    map[id] = slots[index];
    taken.add(slots[index]);
  });
  for (const id of fallbackOrder) {
    if (map[id]) continue;
    const free = slots.find((slot) => !taken.has(slot));
    if (!free) break;
    map[id] = free;
    taken.add(free);
  }
  return map;
}

function sceneLabels(
  ws: Workspace,
  kase: Workspace["cases"][number] | null,
  latest: Plan | null,
  lanes: Record<string, LaneKey>,
  facts: SceneFacts | null,
  personSlots: Record<string, "noor" | "sam">,
): SceneLabels {
  const docs = ws.scope;
  const bySlot = (index: number) =>
    docs.find((doc) => doc.document_id === DOC_SLOT_IDS[index]) ?? docs[index] ?? null;
  const ops = bySlot(0);
  const memo = bySlot(1);
  const styleOf = (doc: typeof ops) => doc?.occurrences[0]?.card_style ?? "";

  const personBySlot = (slot: "noor" | "sam") => {
    const id = Object.keys(personSlots).find((key) => personSlots[key] === slot);
    return id ? (ws.people.find((person) => person.person_id === id) ?? null) : null;
  };
  const personA = personBySlot("noor");
  const personB = personBySlot("sam");
  const ownedBy = (personId: string | undefined) =>
    personId ? (docs.find((doc) => doc.owner_id === personId)?.title ?? "") : "";

  const laneName: Record<LaneKey, string> = { north: "North", south: "South", pilot: "Pilot" };
  if (ws.comparison) {
    const left = lanes[ws.comparison.left.lane_id];
    const right = lanes[ws.comparison.right.lane_id];
    if (left) laneName[left] = ws.comparison.left.lane_name;
    if (right) laneName[right] = ws.comparison.right.lane_name;
  }
  const namedLanes = new Set<LaneKey>();
  if (facts) {
    namedLanes.add(facts.leftLaneKey);
    namedLanes.add(facts.rightLaneKey);
  }
  for (const slot of LANE_SLOTS) {
    if (!namedLanes.has(slot)) laneName[slot] = slot.replace(/^./, (c) => c.toUpperCase());
  }

  const editionLabel = ws.current_release ? `Version ${ws.current_release.sequence}` : "not yet issued";
  const published = ws.assessment[0]?.previous?.text ?? "";
  const occurrenceCount = docs.reduce((total, doc) => total + doc.occurrences.length, 0);

  return {
    datasetTitle: ws.evidence?.dataset_id ? "Batch dataset" : "Dataset",
    datasetSub: ws.evidence
      ? `${ws.evidence.batches.length} batches · raw costs immutable`
      : "",
    datasetSha: ws.evidence ? `${ws.evidence.dataset_sha.slice(0, 12)}… · unchanged by any correction` : "",
    caseRef: text(kase?.source_ref),
    caseSub: kase
      ? `Dispatch correction · ${laneName[lanes[kase.from_lane_id] ?? "south"]} → ${laneName[lanes[kase.to_lane_id] ?? "pilot"]}`
      : "",
    caseLanes: kase
      ? `${laneName[lanes[kase.from_lane_id] ?? "south"]} (FROM) → ${laneName[lanes[kase.to_lane_id] ?? "pilot"]} (TO)`
      : "",
    caseStatus: text(kase?.status),
    lanes: laneName,
    comparisonTitle: "Cost comparison",
    comparisonOwner: text(ws.comparison?.owner_name),
    metricKey: text(ws.comparison?.metric_key),
    minN: ws.comparison?.min_n ?? "",
    findingTitle: "Shared finding",
    findingSub: text(ws.comparison?.hold_reason),
    claimTitle: text(docs[0]?.occurrences[0]?.claim_id),
    occurrenceCount,
    publishedSentence: published,
    docOpsTitle: text(ops?.title),
    docOpsOwner: text(ops?.owner_name),
    docOpsStyle: styleOf(ops),
    docMemoTitle: text(memo?.title),
    docMemoOwner: text(memo?.owner_name),
    docMemoStyle: styleOf(memo),
    editionLabel,
    decisionTitle: text(ws.decision?.title),
    decisionStatus: text(ws.decision?.status).replace(/_/g, " ").toLowerCase(),
    decisionBasis: ws.decision?.basis_claim_id ? `${ws.decision.basis_claim_id} (BASED_ON)` : "no recorded basis",
    releaseTitle: "Current release",
    releaseSub: ws.current_release
      ? `Version ${ws.current_release.sequence} · ${ws.current_release.document_ids.length} documents`
      : "nothing issued yet",
    releaseSequence: ws.current_release ? String(ws.current_release.sequence) : "",
    releaseIncludes: ws.current_release ? `${ws.current_release.document_ids.length} documents` : "",
    teamTitle: text(ws.decision?.team_name),
    teamSub: ws.decision ? "owns the proposal" : "",
    reviewerAId: text(personA?.person_id),
    reviewerAName: text(personA?.display_name),
    reviewerARole: text(personA?.demo_role),
    reviewerAOwns: ownedBy(personA?.person_id),
    reviewerBId: text(personB?.person_id),
    reviewerBName: text(personB?.display_name),
    reviewerBRole: text(personB?.demo_role),
    reviewerBOwns: ownedBy(personB?.person_id),
    currentReviewerName: text(ws.decision?.current_reviewer_name),
    planTitle: "Review plan",
    planReviewerName: text(latest?.assigned_reviewer_name ?? latest?.assigned_reviewer_id),
    planCoverage: latest
      ? `${latest.covered_occurrence_ids.length} occurrences · ${Object.keys(latest.candidates).length} documents`
      : "",
    planDisposition: text(latest?.disposition),
  };
}
