/** Mirrors the backend response models in `backend/app/`. */

export type GraphErrorCode = "GRAPH_UNREACHABLE" | "GRAPH_QUERY_FAILED";

export interface GraphStatus {
  connected: boolean;
  graph: string;
  endpoint: string;
  latency_ms: number | null;
  server_version: string | null;
  error_code: GraphErrorCode | null;
  error_detail: string | null;
}

/** What model the agent would call. The credential is never exposed. */
export interface AgentStatus {
  configured: boolean;
  model: string;
  endpoint: string;
  reasoning: boolean;
  max_model_turns: number;
  max_tool_calls: number;
  max_completion_tokens: number;
  deadline_seconds: number;
}

export interface ReadinessResponse {
  ready: boolean;
  service: string;
  version: string;
  falkordb: GraphStatus;
  agent: AgentStatus;
  implemented_scope: string[];
}

export interface Actor {
  person_id: string;
  display_name: string;
  demo_role: string;
  review_capable: boolean;
}

export interface Person extends Omit<Actor, "person_id"> {
  person_id: string;
}

export interface SideAggregate {
  lane_id: string;
  lane_name: string;
  total_cents: number;
  batch_count: number;
  mean_numerator: number;
  mean_denominator: number;
  mean_display_cents: number;
}

export type Relation = "LOWER_COST" | "HIGHER_COST" | "EQUAL_COST" | "WITHHELD";

export interface Comparison {
  comparison_id: string;
  metric_key: string;
  min_n: number;
  owner_id: string | null;
  owner_name: string | null;
  left: SideAggregate;
  right: SideAggregate;
  relation: Relation;
  magnitude_cents: number;
  hold_reason: string | null;
}

export interface Batch {
  batch_id: string;
  cost_cents: number;
  lane_id: string;
}

export interface Evidence {
  dataset_id: string;
  dataset_sha: string;
  batches: Batch[];
}

export interface SourceBlock {
  id: string;
  kind: "narrative" | "finding" | "decision";
  heading?: string;
  paragraphs?: string[];
}

export interface OccurrenceRef {
  occurrence_id: string;
  block_id: string;
  card_style: "DOLLARS" | "CENTS";
  claim_id: string;
}

export interface DocumentScope {
  document_id: string;
  title: string;
  owner_id: string | null;
  owner_name: string | null;
  blocks: SourceBlock[];
  occurrences: OccurrenceRef[];
}

export interface TypedAssertion {
  subject: string;
  reference: string;
  relation: Relation;
  magnitude_cents: number;
  unit: string;
  card_style: string;
  hold_reason: string | null;
  text: string;
}

export interface Assessment {
  occurrence_id: string;
  document_id: string;
  block_id: string;
  card_style: string;
  previous: Partial<TypedAssertion>;
  current: TypedAssertion;
  relation_changed: boolean;
  magnitude_changed: boolean;
}

export interface Decision {
  decision_id: string;
  title: string;
  status: string;
  basis_claim_id: string | null;
  team_id: string | null;
  team_name: string | null;
  current_reviewer_id: string | null;
  current_reviewer_name: string | null;
}

export interface PlanSummary {
  plan_id: string;
  version: number;
  status: string;
  content_hash: string;
  execution_fingerprint: string;
  invalidation_reason: string | null;
  approved_by: string | null;
  goal: string;
  alternative_flag: boolean;
  disposition: string;
  note: string;
  staged_by: string | null;
  assigned_reviewer_id: string | null;
}

export interface CorrectionCase {
  case_id: string;
  status: string;
  source_note: string;
  source_note_sha: string;
  source_ref: string;
  from_lane_id: string;
  to_lane_id: string;
  request_text: string;
  decision_id: string;
  comparison_id: string;
  applied_by: string | null;
  applied_at: string | null;
  changed_batch_ids: string[];
  affected_lanes: { lane_id: string; role: string }[];
  plans: PlanSummary[];
  agent_runs: AgentRunSummary[];
  clarification_field: string | null;
  clarification_question: string | null;
  clarification_context_ids: string | null;
  clarification_asked_at: string | null;
}

export type JobStatus =
  | "QUEUED"
  | "INVESTIGATING"
  | "STAGING"
  | "AWAITING_REVIEW"
  | "NEEDS_CLARIFICATION"
  | "TOOL_ERROR"
  | "STALE_CONTEXT"
  | "TIMED_OUT"
  | "INTERRUPTED";

export interface AgentRunSummary {
  job_id: string;
  status: JobStatus;
  started_at: string;
  finished_at: string | null;
  plan_id: string | null;
  error_code: string | null;
  elapsed_ms: number;
  request_text: string;
}

/** One real recorded event: a graph read, a model turn, or a tool call. */
export interface AgentEvent {
  at: string;
  kind: "context" | "model" | "tool_start" | "tool" | "message" | "delay";
  tool?: string;
  turn?: number;
  ok?: boolean;
  code?: string | null;
  elapsed_ms?: number;
  finish_reason?: string;
  requested_tools?: string[];
  content_chars?: number;
  arguments?: Record<string, unknown>;
  summary?: string;
  usage?: AgentUsage;
  context_revision?: number;
}

export interface AgentUsage {
  prompt_tokens: number;
  completion_tokens: number;
  reasoning_tokens: number;
  total_tokens: number;
}

export interface AgentJob {
  job_id: string;
  case_id: string;
  status: JobStatus;
  request_text: string;
  requested_by: string;
  model: string;
  endpoint: string;
  reasoning: boolean;
  started_at: string;
  finished_at: string | null;
  events: AgentEvent[];
  usage: Partial<AgentUsage>;
  tool_call_count: number;
  model_turn_count: number;
  elapsed_ms: number;
  plan_id: string | null;
  error_code: string | null;
  error_detail: string | null;
  clarification_question: string | null;
  clarification_field: string | null;
  terminal: boolean;
}

export interface ArtifactEntry {
  path: string;
  sha256: string;
  title: string;
}

export interface Release {
  release_id: string;
  sequence: number;
  issued_at: string;
  artifacts: string;
  receipt: string;
  occurrence_snapshots: string;
  operation_id: string;
  plan_id: string;
  plan_version: number;
  is_current: boolean;
  document_ids: string[];
}

export interface ReleaseSummary {
  release_id: string;
  sequence: number;
  issued_at: string;
  artifacts: string;
  is_current: boolean;
}

export interface Workspace {
  workspace_id: string;
  context_revision: number;
  demo: boolean;
  hold: { code: string; detail: string } | null;
  evidence: Evidence | null;
  comparison: Comparison | null;
  scope: DocumentScope[];
  assessment: Assessment[];
  decision: Decision | null;
  cases: CorrectionCase[];
  current_release: Release | null;
  releases: ReleaseSummary[];
  people: Person[];
  verification_scope: string;
}

export interface Plan {
  plan_id: string;
  version: number;
  status: string;
  raw_request: string;
  goal: string;
  alternative_flag: boolean;
  disposition: string;
  note: string;
  content_hash: string;
  execution_fingerprint: string;
  candidates: Record<string, string>;
  scope: PlanScope | null;
  context_revision: number;
  prior_release_id: string;
  staged_at: string;
  staged_by: string | null;
  approved_at: string | null;
  acknowledged_alternative: boolean | null;
  invalidation_reason: string | null;
  superseded_by: string | null;
  case_id: string;
  approved_by: string | null;
  assigned_reviewer_id: string | null;
  assigned_reviewer_name: string | null;
  covered_occurrence_ids: string[];
}

export interface PlanScope {
  documents: { document_id: string; title: string; owner_name: string | null }[];
  occurrences: OccurrenceRef[] & { document_id: string }[];
  assessment: Assessment[];
  decision: {
    decision_id: string;
    title: string;
    current_status: string;
    expected_status: string;
    basis_claim_id: string | null;
  };
  authority: { reviewer_id: string; reviewer_name: string; team_name: string | null };
  requested_focus: string[];
  verification_scope: string;
}

export interface ApiFailure {
  code: string;
  detail: string;
  context?: Record<string, unknown>;
}
