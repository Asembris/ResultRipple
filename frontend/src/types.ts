/** Mirrors the backend response models in `backend/app/models.py`. */

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

export interface ReadinessResponse {
  ready: boolean;
  service: string;
  version: string;
  falkordb: GraphStatus;
  implemented_scope: string[];
}
