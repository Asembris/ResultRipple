import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import App from "../src/App";
import type { ReadinessResponse } from "../src/types";

const READY: ReadinessResponse = {
  ready: true,
  service: "resultripple-api",
  version: "0.1.0",
  falkordb: {
    connected: true,
    graph: "resultripple",
    endpoint: "127.0.0.1:6379",
    latency_ms: 1.2,
    server_version: "7.4.0",
    error_code: null,
    error_detail: null,
  },
  implemented_scope: ["health", "readiness"],
};

const GRAPH_DOWN: ReadinessResponse = {
  ...READY,
  ready: false,
  falkordb: {
    ...READY.falkordb,
    connected: false,
    latency_ms: null,
    server_version: null,
    error_code: "GRAPH_UNREACHABLE",
    error_detail: "ConnectionError: connection refused",
  },
};

function stubFetch(status: number, body: ReadinessResponse) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(JSON.stringify(body), { status })),
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("App", () => {
  it("shows the real backend and FalkorDB readiness", async () => {
    stubFetch(200, READY);

    render(<App />);

    expect(await screen.findByText(/API and FalkorDB reachable/)).toBeDefined();
    expect(screen.getByText(/graph "resultripple"/)).toBeDefined();
  });

  it("reports an unreachable graph instead of claiming readiness", async () => {
    stubFetch(503, GRAPH_DOWN);

    render(<App />);

    expect(await screen.findByText(/Graph-backed work unavailable/)).toBeDefined();
    expect(screen.getByText(/GRAPH_UNREACHABLE/)).toBeDefined();
  });

  it("reports an unreachable API", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("Failed to fetch");
      }),
    );

    render(<App />);

    expect(await screen.findByText(/Backend unreachable/)).toBeDefined();
  });
});
