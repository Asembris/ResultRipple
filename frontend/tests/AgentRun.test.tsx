import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import App from "../src/App";
import type { AgentJob, Workspace } from "../src/types";
import {
  AGENT_JOB_STAGED,
  AGENT_JOB_WAITING,
  WORKSPACE_AGENT_STAGED,
  WORKSPACE_AGENT_WAITING,
  WORKSPACE_CORRECTED,
} from "./fixtures";

/**
 * The agent surface, driven by job records the real backend produced. The app
 * must show what the server reported and nothing more: no invented reasoning
 * trace, no success state the job did not reach.
 */

/** The plan record the real app reads back for the case's latest version. */
function planFor(workspace: Workspace) {
  const kase = workspace.cases.find((entry) => entry.source_ref === "DX-2026-0914");
  const summary = kase?.plans.at(-1);
  if (!kase || !summary) return null;
  return {
    ...summary,
    raw_request: kase.request_text,
    candidates: Object.fromEntries(workspace.scope.map((doc, i) => [doc.document_id, String(i).repeat(64)])),
    scope: null,
    context_revision: workspace.context_revision,
    prior_release_id: workspace.current_release?.release_id ?? "",
    staged_at: "2026-10-15T10:00:00Z",
    approved_at: null,
    acknowledged_alternative: null,
    superseded_by: null,
    case_id: kase.case_id,
    assigned_reviewer_name: workspace.people.find((p) => p.person_id === summary.assigned_reviewer_id)?.display_name ?? null,
    covered_occurrence_ids: workspace.scope.flatMap((doc) => doc.occurrences.map((o) => o.occurrence_id)),
  };
}

interface Call {
  url: string;
  method: string;
  body: unknown;
}

function stubApi({
  workspace,
  job,
  calls = [],
  agentConfigured = true,
}: {
  workspace: Workspace;
  job?: AgentJob;
  calls?: Call[];
  agentConfigured?: boolean;
}) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      calls.push({
        url,
        method: init?.method ?? "GET",
        body: init?.body ? JSON.parse(String(init.body)) : undefined,
      });
      const actor = {
        person_id: "person-ari",
        display_name: "Ari Mensah",
        demo_role: "analyst",
        review_capable: false,
      };
      if (url.endsWith("/auth/session")) {
        return new Response(JSON.stringify({ actor }), { status: 200 });
      }
      if (url.endsWith("/ready")) {
        return new Response(
          JSON.stringify({
            ready: true,
            service: "resultripple-api",
            version: "0.3.0",
            falkordb: {
              connected: true,
              graph: "resultripple",
              endpoint: "127.0.0.1:6379",
              latency_ms: 1.2,
              server_version: "8.10.2",
              error_code: null,
              error_detail: null,
            },
            agent: {
              configured: agentConfigured,
              model: "nvidia/nemotron-3-super-120b-a12b",
              endpoint: "https://integrate.api.nvidia.com/v1",
              reasoning: false,
              max_model_turns: 4,
              max_tool_calls: 6,
              max_completion_tokens: 4096,
              deadline_seconds: 25,
            },
            implemented_scope: ["nvidia-agent-runs"],
          }),
          { status: 200 },
        );
      }
      if (url.includes("/agent-runs") && (init?.method ?? "GET") === "POST") {
        return new Response(
          JSON.stringify({
            job_id: job?.job_id ?? "job-new",
            case_id: "case-dispatch-b09-b11",
            status: "QUEUED",
            request_text: JSON.parse(String(init?.body)).request_text,
            model: "nvidia/nemotron-3-super-120b-a12b",
          }),
          { status: 202 },
        );
      }
      if (url.includes("/jobs/")) {
        if (!job) return new Response(JSON.stringify({ code: "JOB_UNKNOWN" }), { status: 404 });
        return new Response(JSON.stringify(job), { status: 200 });
      }
      if (url.includes("/plans/")) {
        const plan = planFor(workspace);
        if (!plan) return new Response(JSON.stringify({ code: "PLAN_UNKNOWN" }), { status: 404 });
        return new Response(JSON.stringify(plan), { status: 200 });
      }
      return new Response(JSON.stringify(workspace), { status: 200 });
    }),
  );
}

/** The investigation panel, opening it the way a user does when it is the next step. */
async function agentPanel() {
  await screen.findByRole("complementary", { name: /workflow/i });
  const open = await screen
    .findByRole("button", { name: /Ask the agent to prepare the review/i })
    .catch(() => null);
  if (open) fireEvent.click(open);
  return within(await screen.findByRole("region", { name: /Ask the agent/i }));
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("the agent surface", () => {
  it("shows the real model configuration and its bounds", async () => {
    stubApi({ workspace: WORKSPACE_CORRECTED });
    render(<App />);

    const panel = await agentPanel();
    const configuration = await panel.findAllByText((_, element) =>
      Boolean(
        element?.className === "meta" &&
          (element?.textContent ?? "").includes("nvidia/nemotron-3-super-120b-a12b at https://"),
      ),
    );
    const text = (configuration[0].textContent ?? "").replace(/\s+/g, " ");
    expect(text).toContain("at most 4 model turns, 6 tool calls and 4096 completion tokens");
    expect(text).toContain("within 25s");
  });

  it("sends the analyst's own words and nothing else", async () => {
    const calls: Call[] = [];
    stubApi({ workspace: WORKSPACE_CORRECTED, job: AGENT_JOB_STAGED, calls });
    render(<App />);

    const panel = await agentPanel();
    const composer = panel.getByLabelText(/your request, in your own words/i);
    fireEvent.change(composer, { target: { value: "Fix the reports please." } });
    fireEvent.click(panel.getByRole("button", { name: /Run agent/ }));

    await waitFor(() => {
      const start = calls.find((call) => call.method === "POST" && call.url.includes("/agent-runs"));
      expect(start?.body).toEqual({ request_text: "Fix the reports please." });
    });
  });

  it("replays the run's actual tool events and measured cost", async () => {
    stubApi({ workspace: WORKSPACE_AGENT_STAGED, job: AGENT_JOB_STAGED });
    render(<App />);

    const panel = await agentPanel();
    expect(await panel.findByText(/Staged for review/)).toBeDefined();
    // Both the composer and the recorded run show the instruction verbatim.
    expect(panel.getAllByText(AGENT_JOB_STAGED.request_text).length).toBeGreaterThan(0);
    expect(panel.getByText(/Read current context from FalkorDB/)).toBeDefined();
    expect(panel.getByText(/asked for inspect_impact/)).toBeDefined();
    expect(panel.getByText(/investigated registered impact/)).toBeDefined();
    expect(panel.getByText(/staged the candidate review/)).toBeDefined();

    const measured = panel
      .getAllByText((_, element) => (element?.textContent ?? "").includes("tool call"))
      .map((element) => (element.textContent ?? "").replace(/\s+/g, " "))
      .join(" | ");
    expect(measured).toContain(`${AGENT_JOB_STAGED.model_turn_count} model turns`);
    expect(measured).toContain(`${AGENT_JOB_STAGED.tool_call_count} tool calls`);
    expect(measured).toContain(`${AGENT_JOB_STAGED.usage.total_tokens} tokens`);
  });

  it("shows the requested goal, the evidence and the proposed alternative together", async () => {
    stubApi({ workspace: WORKSPACE_AGENT_STAGED, job: AGENT_JOB_STAGED });
    render(<App />);

    const panel = await agentPanel();
    expect(await panel.findByText(/What the agent proposes/)).toBeDefined();
    expect(panel.getByText(/keep the cheaper claim/)).toBeDefined();
    expect(panel.getByText(/South costs 40 cents more per parcel than North/)).toBeDefined();
    expect(panel.getByText(/correct\s+2 registered uses and return the proposal for review/)).toBeDefined();
    // An alternative is a proposal, never recorded consent.
    expect(panel.getByText(/an alternative is a proposal, not consent/)).toBeDefined();
    expect(panel.getByText(/unassessed commentary/)).toBeDefined();
  });

  it("shows the persisted question instead of a plan when intent is unresolved", async () => {
    stubApi({ workspace: WORKSPACE_AGENT_WAITING, job: AGENT_JOB_WAITING });
    render(<App />);

    const panel = await agentPanel();
    expect(await panel.findByText(/Waiting for your answer/)).toBeDefined();
    expect(panel.getByText(AGENT_JOB_WAITING.clarification_question ?? "")).toBeDefined();
    expect(panel.getByText(/no review is staged and nothing is published/)).toBeDefined();
    expect(panel.queryByText(/What the agent proposes/)).toBeNull();
  });

  it("reports a failed run honestly rather than claiming a staged review", async () => {
    const failed: AgentJob = {
      ...AGENT_JOB_STAGED,
      status: "TIMED_OUT",
      plan_id: null,
      error_code: "MODEL_TIMEOUT",
      error_detail: "the model did not answer within the remaining job deadline",
    };
    stubApi({ workspace: WORKSPACE_CORRECTED, job: failed });
    render(<App />);

    const panel = await agentPanel();
    fireEvent.click(panel.getByRole("button", { name: /Run agent/ }));
    expect(await panel.findByText(/Timed out/)).toBeDefined();
    expect(panel.getByText(/MODEL_TIMEOUT/)).toBeDefined();
    expect(panel.getByText(/Nothing was staged, approved, or published/)).toBeDefined();
    expect(panel.queryByText(/What the agent proposes/)).toBeNull();
  });

  it("offers the labelled manual fallback when no model is configured", async () => {
    stubApi({ workspace: WORKSPACE_CORRECTED, agentConfigured: false });
    render(<App />);

    const panel = await agentPanel();
    expect(await panel.findByText(/Manual correction workflow — AI unavailable/)).toBeDefined();
    expect((panel.getByRole("button", { name: /Run agent/ }) as HTMLButtonElement).disabled).toBe(
      true,
    );
    expect(screen.getByText(/fallback without the agent/)).toBeDefined();
    expect(screen.getByRole("button", { name: /Stage manually instead/ })).toBeDefined();
  });

  it("lets only the analyst send a request", async () => {
    stubApi({ workspace: WORKSPACE_CORRECTED });
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.endsWith("/auth/session")) {
          return new Response(JSON.stringify({ actor: null }), { status: 200 });
        }
        if (url.endsWith("/ready")) return new Response("{}", { status: 500 });
        if (url.includes("/plans/") || url.includes("/jobs/")) {
          return new Response("{}", { status: 404 });
        }
        return new Response(JSON.stringify(WORKSPACE_CORRECTED), { status: 200 });
      }),
    );
    render(<App />);

    const panel = await agentPanel();
    expect(await panel.findByText(/Sign in as the analyst to send a request/)).toBeDefined();
    expect((panel.getByRole("button", { name: /Run agent/ }) as HTMLButtonElement).disabled).toBe(
      true,
    );
  });
});
