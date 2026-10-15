import type { Actor, AgentJob, AgentRunSummary, Plan, ReadinessResponse, Workspace } from "./types";

/**
 * Same-origin by default: the dev server proxies `/api` to the backend so the
 * HttpOnly demo session cookie is first-party.
 */
const BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? "/api").replace(/\/$/, "");

export class ApiUnreachableError extends Error {}

/** A typed refusal from the server: a stable code plus the witness for it. */
export class ApiRefusal extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    readonly detail: string,
    readonly context: Record<string, unknown> = {},
  ) {
    super(`${code}: ${detail}`);
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${BASE_URL}${path}`, {
      ...init,
      credentials: "include",
      headers: { accept: "application/json", ...(init?.body ? { "content-type": "application/json" } : {}), ...init?.headers },
    });
  } catch (cause) {
    throw new ApiUnreachableError(`API unreachable at ${BASE_URL}`, { cause });
  }
  const body = response.status === 204 ? null : await response.json().catch(() => null);
  if (!response.ok) {
    const failure = (body ?? {}) as { code?: string; detail?: string; context?: Record<string, unknown> };
    throw new ApiRefusal(
      response.status,
      failure.code ?? `HTTP_${response.status}`,
      failure.detail ?? response.statusText,
      failure.context ?? {},
    );
  }
  return body as T;
}

/** A 503 here is a real answer: the API is up but FalkorDB is not. */
export async function fetchReadiness(): Promise<ReadinessResponse> {
  let response: Response;
  try {
    response = await fetch(`${BASE_URL}/ready`, {
      headers: { accept: "application/json" },
      credentials: "include",
    });
  } catch (cause) {
    throw new ApiUnreachableError(`API unreachable at ${BASE_URL}`, { cause });
  }
  if (response.status !== 200 && response.status !== 503) {
    throw new ApiUnreachableError(`API returned HTTP ${response.status}`);
  }
  return (await response.json()) as ReadinessResponse;
}

export const fetchWorkspace = () => request<Workspace>("/workspace");

export const fetchSession = () => request<{ actor: Actor | null }>("/auth/session");

/**
 * The passcode is typed by the operator and sent straight to the server. It is
 * never bundled, stored, or read back from the API.
 */
export const startSession = (personId: string, passcode: string) =>
  request<Actor>("/auth/demo-session", {
    method: "POST",
    body: JSON.stringify({ person_id: personId, passcode }),
  });

export const signOut = () =>
  request<{ actor: null }>("/auth/sign-out", { method: "POST" });

export const applyCorrection = (caseId: string, batchIds: string[], revision: number) =>
  request<{ applied_edge_count: number; context_revision: number }>(
    `/corrections/${caseId}/apply`,
    {
      method: "POST",
      body: JSON.stringify({
        batch_ids: batchIds,
        expected_context_revision: revision,
        source_confirmed: true,
      }),
    },
  );

export interface StageIntent {
  raw_request: string;
  goal: string;
  disposition: string;
  alternative_flag: boolean;
  note: string;
  idempotency_key: string;
}

export const stageReview = (caseId: string, intent: StageIntent) =>
  request<Plan>(`/cases/${caseId}/stage-review`, {
    method: "POST",
    body: JSON.stringify({ ...intent, focus_occurrence_ids: [] }),
  });

/**
 * Start one bounded agent run. The body carries the analyst's own words and
 * nothing else: no scope, reviewer, disposition, or number.
 */
export const startAgentRun = (caseId: string, requestText: string) =>
  request<{ job_id: string; case_id: string; status: string; request_text: string; model: string }>(
    `/cases/${caseId}/agent-runs`,
    { method: "POST", body: JSON.stringify({ request_text: requestText }) },
  );

/** The job as the server recorded it: real status, tool events, usage, result. */
export const fetchJob = (jobId: string) => request<AgentJob>(`/jobs/${jobId}`);

export const fetchAgentRuns = (caseId: string) =>
  request<{ case_id: string; runs: AgentRunSummary[] }>(`/cases/${caseId}/agent-runs`);

export const refreshReview = (caseId: string) =>
  request<Plan>(`/cases/${caseId}/refresh-review`, { method: "POST" });

export const fetchPlan = (planId: string) => request<Plan>(`/plans/${planId}`);

export const approvePlan = (plan: Plan, acknowledged: boolean) =>
  request<Plan>(`/plans/${plan.plan_id}/approve`, {
    method: "POST",
    body: JSON.stringify({
      plan_version: plan.version,
      execution_fingerprint: plan.execution_fingerprint,
      acknowledged_alternative: acknowledged,
    }),
  });

export const rejectPlan = (planId: string, reason: string) =>
  request<Plan>(`/plans/${planId}/reject`, {
    method: "POST",
    body: JSON.stringify({ reason }),
  });

export const issueRelease = (planId: string, operationId: string) =>
  request<{ release: { release_id: string }; idempotent: boolean }>(
    `/plans/${planId}/release`,
    { method: "POST", body: JSON.stringify({ operation_id: operationId }) },
  );

export const reassignReviewer = (from: string, to: string, revision: number) =>
  request<{ previous_reviewer_id: string; current_reviewer_id: string }>(
    "/demo/reviewer-assignment",
    {
      method: "POST",
      body: JSON.stringify({
        from_person_id: from,
        to_person_id: to,
        expected_context_revision: revision,
      }),
    },
  );

export const candidateUrl = (planId: string, documentId: string) =>
  `${BASE_URL}/plans/${planId}/candidates/${documentId}`;

export const editionUrl = (releaseId: string, documentId: string, download = false) =>
  `${BASE_URL}/editions/${releaseId}/${documentId}${download ? "?download=1" : ""}`;

export const receiptUrl = (releaseId: string) => `${BASE_URL}/releases/${releaseId}/receipt`;

export const apiBaseUrl = BASE_URL;
