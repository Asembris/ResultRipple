import type {
  Actor,
  AgentJob,
  AgentRunSummary,
  Plan,
  ReadinessResponse,
  Receipt,
  Workspace,
} from "./types";

/**
 * Same-origin by default: the dev server proxies `/api` to the backend so the
 * HttpOnly demo session cookie is first-party.
 */
const BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? "/api").replace(/\/$/, "");

/**
 * The API itself did not answer: a network failure, or the proxy in front of it
 * reporting a gateway error without the API's own typed body.
 */
export class ApiUnreachableError extends Error {}

const GATEWAY_STATUSES = new Set([502, 503, 504]);

function isTypedRefusal(body: unknown): body is { code: string } {
  return typeof body === "object" && body !== null && typeof (body as { code?: unknown }).code === "string";
}

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
  if (GATEWAY_STATUSES.has(response.status) && !isTypedRefusal(body)) {
    // The proxy answered for an API that did not.
    throw new ApiUnreachableError(`API unreachable: the proxy returned HTTP ${response.status}`);
  }
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

/**
 * A 503 carrying a readiness body is a real answer: the API is up but FalkorDB
 * is not. Any other failure means the API itself could not be reached.
 */
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
  const body = (await response.json().catch(() => null)) as ReadinessResponse | null;
  if (!body || typeof body.falkordb !== "object" || body.falkordb === null) {
    throw new ApiUnreachableError(`API unreachable: the proxy returned HTTP ${response.status}`);
  }
  return body;
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

/**
 * Register the displayed comparison as an approved finding. The body names the
 * comparison, the revision the analyst saw and the explicit confirmation; the
 * server writes the finding's title and every sentence rendered from it.
 */
export const createFinding = (comparisonId: string, revision: number, confirmed: boolean) =>
  request<{ claim_id: string; context_revision: number; reused: boolean }>("/findings", {
    method: "POST",
    body: JSON.stringify({
      comparison_id: comparisonId,
      expected_context_revision: revision,
      confirmed_intended_comparison: confirmed,
    }),
  });

export const insertLinkedFinding = (
  documentId: string,
  claimId: string,
  cardStyle: string,
  revision: number,
) =>
  request<{ occurrence_id: string; context_revision: number; reused: boolean }>(
    `/documents/${documentId}/linked-findings`,
    {
      method: "POST",
      body: JSON.stringify({
        claim_id: claimId,
        card_style: cardStyle,
        expected_context_revision: revision,
      }),
    },
  );

export const recordDecisionBasis = (
  decisionId: string,
  claimId: string,
  revision: number,
  confirmed: boolean,
) =>
  request<{ decision_id: string; claim_id: string; context_revision: number; reused: boolean }>(
    `/decisions/${decisionId}/basis`,
    {
      method: "POST",
      body: JSON.stringify({
        claim_id: claimId,
        expected_context_revision: revision,
        confirmed_basis: confirmed,
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

export const approvePlan = (
  plan: Pick<Plan, "plan_id" | "version" | "execution_fingerprint">,
  acknowledged: boolean,
) =>
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

export const fetchReceipt = (releaseId: string) => request<Receipt>(`/releases/${releaseId}/receipt`);

export const apiBaseUrl = BASE_URL;
