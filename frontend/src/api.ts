import type { ReadinessResponse } from "./types";

const BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? "http://127.0.0.1:8000").replace(
  /\/$/,
  "",
);

export class ApiUnreachableError extends Error {}

/**
 * Reads backend readiness. A 503 is a real answer here — the backend is up but
 * FalkorDB is not — so it is parsed rather than thrown.
 */
export async function fetchReadiness(): Promise<ReadinessResponse> {
  let response: Response;
  try {
    response = await fetch(`${BASE_URL}/ready`, { headers: { accept: "application/json" } });
  } catch (cause) {
    throw new ApiUnreachableError(`API unreachable at ${BASE_URL}`, { cause });
  }

  if (response.status !== 200 && response.status !== 503) {
    throw new ApiUnreachableError(`API returned HTTP ${response.status}`);
  }

  return (await response.json()) as ReadinessResponse;
}

export const apiBaseUrl = BASE_URL;
