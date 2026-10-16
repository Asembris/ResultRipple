import { fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import App from "../src/App";
import type { Plan, Workspace } from "../src/types";
import {
  AGENT_JOB_FINISHED,
  PLAN_V1_FINISHED,
  PLAN_V2_FINISHED,
  RECEIPTS_FINISHED,
  WORKSPACE_FINISHED,
} from "./finishedFixtures";

/**
 * The finished demo case, as a signed-out visitor reads it. Every response is a
 * recorded server response; the story on screen must come from them alone.
 */

function stubApi({
  workspace = WORKSPACE_FINISHED,
  priorPlan = PLAN_V1_FINISHED,
  calls = [] as string[],
}: { workspace?: Workspace; priorPlan?: Plan; calls?: string[] } = {}) {
  const plans: Record<string, Plan> = {
    [priorPlan.plan_id]: priorPlan,
    [PLAN_V2_FINISHED.plan_id]: PLAN_V2_FINISHED,
  };
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      calls.push(`${init?.method ?? "GET"} ${url}`);
      const json = (body: unknown, status = 200) =>
        new Response(JSON.stringify(body), { status });
      if (url.endsWith("/auth/session")) return json({ actor: null });
      if (url.endsWith("/ready")) return json({}, 500);
      if (url.includes("/jobs/")) return json(AGENT_JOB_FINISHED);
      const plan = url.match(/\/plans\/([^/?]+)$/);
      if (plan) return plans[plan[1]] ? json(plans[plan[1]]) : json({ code: "PLAN_UNKNOWN" }, 404);
      const receipt = url.match(/\/releases\/([^/]+)\/receipt$/);
      if (receipt) return json(RECEIPTS_FINISHED[receipt[1]] ?? {}, RECEIPTS_FINISHED[receipt[1]] ? 200 : 404);
      return json(workspace);
    }),
  );
}

const announced = () => document.querySelector(".rr-sr-only")?.textContent ?? "";
const panel = async () => within(await screen.findByRole("complementary", { name: /workflow/i }));

async function openStep(step: number, name: string) {
  await screen.findByRole("complementary", { name: /workflow/i });
  fireEvent.click(await screen.findByRole("button", { name: `View step ${step}: ${name}` }));
}

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("the finished case", () => {
  it("opens step 3 on the recorded run, and an already-finished job does not move the view", async () => {
    const calls: string[] = [];
    stubApi({ calls });
    render(<App />);

    await openStep(3, "Investigation");
    const view = await panel();
    expect(await view.findByText(/investigated registered impact/)).toBeDefined();
    expect(view.getByText(/staged the candidate review/)).toBeDefined();
    expect(view.getByText(/asked to investigate registered impact \(inspect_impact\)/)).toBeDefined();
    expect(view.getAllByText(new RegExp(AGENT_JOB_FINISHED.model)).length).toBeGreaterThan(0);
    // The raw request beside the plain reading of it, and the alternative.
    expect(view.getByText(AGENT_JOB_FINISHED.request_text)).toBeDefined();
    expect(view.getByText(/read as “keep the cheaper claim”/)).toBeDefined();
    expect(view.getByText(/Correct 2 registered uses and return the .* for review/)).toBeDefined();

    // Several polls later the panel is still step 3, and nothing was committed.
    await new Promise((resolve) => setTimeout(resolve, 2200));
    expect(announced()).toBe("Step 3 of 7: Investigation");
    expect(calls.filter((call) => !call.startsWith("GET"))).toEqual([]);
  });

  it("labels the step-2 button as a look back at the run", async () => {
    stubApi();
    render(<App />);
    await openStep(2, "Correction");
    const view = await panel();
    fireEvent.click(await view.findByRole("button", { name: /See what the agent did/ }));
    expect(await view.findByText(/investigated registered impact/)).toBeDefined();
    expect(announced()).toBe("Step 3 of 7: Investigation");
  });
});

describe("the finished case's authority history", () => {
  it("says the move in the order it happened and offers no reassignment", async () => {
    stubApi();
    render(<App />);
    await openStep(5, "Authority");
    const view = await panel();
    expect(await view.findByText("Review authority moved from Noor to Sam.")).toBeDefined();
    expect(view.queryByRole("button", { name: /Reassign review authority/ })).toBeNull();
    expect(view.getByText(/set by the team’s review rota\. Owning a document neither grants nor removes that right/)).toBeDefined();
    // Ownership from the registered documents: Noor owns none.
    expect(view.getByText(/Noor Haddad owns no document/)).toBeDefined();
    expect(view.getByText(/Sam Oyelaran owns the South Expansion Memo/)).toBeDefined();
    expect(view.queryByText(/may own a document/)).toBeNull();
  });

  it("names the earlier approval and the refused release from the plan's own record", async () => {
    stubApi();
    render(<App />);
    await openStep(6, "Fresh approval");
    const view = await panel();
    expect(await view.findByText("Noor approved these same files.")).toBeDefined();
    expect(
      view.getByText("The release was refused because the reviewer changed (AUTHORITY_CHANGED)."),
    ).toBeDefined();
    expect(view.getByText("Sam approved again.")).toBeDefined();
  });

  it("claims no refused release when the server recorded none", async () => {
    stubApi({ priorPlan: { ...PLAN_V1_FINISHED, refused_action: null, refused_at: null } });
    render(<App />);
    await openStep(6, "Fresh approval");
    const view = await panel();
    expect(
      await view.findByText(
        "That approval no longer counts because the reviewer changed (AUTHORITY_CHANGED).",
      ),
    ).toBeDefined();
    expect(view.queryByText(/release was refused/)).toBeNull();
  });
});

describe("the finished case's before and after", () => {
  it("shows the published figures the correction replaced, from the earlier release's receipt", async () => {
    stubApi();
    render(<App />);
    await openStep(2, "Correction");
    const view = await panel();
    expect(
      await view.findByText(/South \$3\.60 over 7 batches → \$4\.40 over 4 · finding reversed/),
    ).toBeDefined();
    expect(view.getByText("$0.40 cheaper")).toBeDefined();
    expect(view.queryByText(/did not observe the earlier value/)).toBeNull();
    expect(view.queryByText(/Every registered use still matches/)).toBeNull();
    expect(view.getByText(/narrative is not assessed/)).toBeDefined();
  });

  it("shows the proposal status the plan recorded before and after", async () => {
    stubApi();
    render(<App />);
    await openStep(4, "Review");
    const view = await panel();
    expect(await view.findByText("Proposed")).toBeDefined();
    expect(view.getByText("Returned for review")).toBeDefined();
    expect(view.getByText(/v2 · return the proposal for review/)).toBeDefined();
  });
});

describe("a signed-out visitor", () => {
  it("lands on the desk and keeps the purpose line in view", async () => {
    stubApi();
    render(<App />);
    await screen.findByRole("complementary", { name: /workflow/i });
    expect(announced()).toBe("Step 1 of 7: Desk");
    expect(
      screen.getByText(/every linked report and decision is corrected and re-approved by\s+the right person/),
    ).toBeDefined();
  });
});
