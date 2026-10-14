import { render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import App from "../src/App";
import type { Workspace } from "../src/types";
import { WORKSPACE_CORRECTED, WORKSPACE_V1 } from "./fixtures";

/** Routes each endpoint the app calls; nothing here fakes a product answer. */
function stubApi(workspace: Workspace | { status: number; body: unknown }) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/auth/session")) {
        return new Response(
          JSON.stringify({
            actor: {
              person_id: "person-noor",
              display_name: "Noor Haddad",
              demo_role: "reviewer",
              review_capable: true,
            },
          }),
          { status: 200 },
        );
      }
      if (url.endsWith("/ready")) {
        return new Response(
          JSON.stringify({
            ready: true,
            service: "resultripple-api",
            version: "0.2.0",
            falkordb: {
              connected: true,
              graph: "resultripple",
              endpoint: "127.0.0.1:6379",
              latency_ms: 1.2,
              server_version: "8.10.2",
              error_code: null,
              error_detail: null,
            },
            implemented_scope: [],
          }),
          { status: 200 },
        );
      }
      if (url.includes("/plans/")) {
        return new Response(JSON.stringify({}), { status: 404 });
      }
      if ("status" in workspace) {
        return new Response(JSON.stringify(workspace.body), { status: workspace.status });
      }
      return new Response(JSON.stringify(workspace), { status: 200 });
    }),
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("publishing desk", () => {
  it("shows the shared finding, both registered uses and the proposal", async () => {
    stubApi(WORKSPACE_V1);

    render(<App />);

    expect(await screen.findByText(/1 shared finding/)).toBeDefined();
    expect(screen.getByText(/2 registered uses/)).toBeDefined();
    expect(screen.getByText("Operations Cost Review")).toBeDefined();
    expect(screen.getByText("South Expansion Memo")).toBeDefined();
    expect(screen.getByText("South lane expansion proposal")).toBeDefined();
    expect(screen.getByText(/South costs less than North by \$0\.40 per parcel/)).toBeDefined();
  });

  it("marks both published cards out of date after the correction", async () => {
    stubApi(WORKSPACE_CORRECTED);

    render(<App />);

    expect(await screen.findByText(/Review needed/)).toBeDefined();
    const stale = screen.getAllByText(/Out of date against current evidence/);
    expect(stale).toHaveLength(2);
    expect(screen.getAllByText(/\(direction changed\)/)).toHaveLength(2);
    expect(screen.getByText(/South costs more than North by \$0\.40 per parcel/)).toBeDefined();
  });

  it("names the current review authority rather than a document owner", async () => {
    stubApi(WORKSPACE_V1);

    render(<App />);

    const nav = await screen.findByRole("navigation", { name: /demo identities/i });
    expect(within(nav).getByRole("button", { name: /Noor Haddad/ }).textContent).toContain("★");
    expect(within(nav).getByRole("button", { name: /Sam Oyelaran/ }).textContent).not.toContain("★");
  });

  it("keeps the unassessed-narrative label on every report", async () => {
    stubApi(WORKSPACE_V1);

    render(<App />);

    const labels = await screen.findAllByText(/not assessed by ResultRipple/);
    expect(labels.length).toBeGreaterThanOrEqual(2);
  });

  it("stops instead of inventing an answer when the graph is unavailable", async () => {
    stubApi({
      status: 503,
      body: { code: "GRAPH_UNREACHABLE", detail: "ConnectionError: connection refused" },
    });

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
