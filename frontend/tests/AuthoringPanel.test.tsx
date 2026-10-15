import { fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import DeskStage from "../src/components/stages/DeskStage";
import type { StageContext } from "../src/components/stages/context";
import { sceneLinks } from "../src/graph/stageFromWorkspace";
import type { Actor, Workspace } from "../src/types";
import {
  WORKSPACE_FINDING_REGISTERED,
  WORKSPACE_FRESH,
  WORKSPACE_PLACED_NO_BASIS,
} from "./authoringFixtures";
import { WORKSPACE_V1 } from "./fixtures";

/**
 * Authoring on the desk renders only what the server returned, and each action
 * sends exactly the comparison, claim, style and revision the server supplied.
 * The confirmation the person ticked is sent as given; the server, not the
 * page, refuses an unconfirmed binding.
 */

const ari: Actor = {
  person_id: "person-ari",
  display_name: "Ari Mensah",
  demo_role: "analyst",
  review_capable: false,
};
const noor: Actor = {
  person_id: "person-noor",
  display_name: "Noor Haddad",
  demo_role: "reviewer",
  review_capable: true,
};

type Call = { url: string; method: string; body: unknown };

function stubFetch(calls: Call[]) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      calls.push({
        url: String(input),
        method: init?.method ?? "GET",
        body: init?.body ? JSON.parse(String(init.body)) : undefined,
      });
      return new Response(JSON.stringify({ context_revision: 99, reused: false }), { status: 200 });
    }),
  );
}

function context(workspace: Workspace, actor: Actor | null): StageContext {
  return {
    workspace,
    actor,
    readiness: null,
    kase: workspace.cases.find((entry) => entry.source_ref === "DX-2026-0914") ?? null,
    plan: null,
    priorPlan: null,
    previousComparison: null,
    busy: false,
    step: 1,
    serverStep: 2,
    currentStep: 1,
    goTo: vi.fn(),
    commit: vi.fn(async (action: () => Promise<unknown>) => action()) as StageContext["commit"],
    focusNode: vi.fn(),
    openViewer: vi.fn(),
    refusal: null,
    dismissRefusal: vi.fn(),
    notify: vi.fn(),
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("authoring on the publishing desk", () => {
  it("shows the comparison facts and sentence exactly as the server sent them", () => {
    render(<DeskStage context={context(WORKSPACE_FRESH, ari)} />);
    const card = screen.getByRole("region", { name: "Comparison" });
    const comparison = WORKSPACE_FRESH.comparison!;

    expect(within(card).getByText(comparison.sentence!)).toBeTruthy();
    expect(within(card).getByText(new RegExp(comparison.dataset_title!))).toBeTruthy();
    expect(within(card).getByText(new RegExp(`unit ${comparison.unit}`))).toBeTruthy();
    const rows = within(card).getAllByRole("row").slice(1);
    expect(rows.map((row) => row.textContent)).toEqual([
      `${comparison.left.lane_name}${comparison.left.batch_count}$4.00`,
      `${comparison.right.lane_name}${comparison.right.batch_count}$3.60`,
    ]);
    // Nothing published yet, so nothing is described as contradicted.
    expect(screen.queryByText(/out of date|contradicted/i)).toBeNull();
    expect(screen.getByText(WORKSPACE_FRESH.verification_scope)).toBeTruthy();
    expect(screen.queryByText(/One finding, two reports/)).toBeNull();
  });

  it("registers the displayed comparison with the revision it was shown at", async () => {
    const calls: Call[] = [];
    stubFetch(calls);
    render(<DeskStage context={context(WORKSPACE_FRESH, ari)} />);

    fireEvent.click(screen.getByRole("button", { name: /Use this finding/ }));
    fireEvent.click(screen.getByRole("checkbox", { name: /This is the intended comparison/ }));
    fireEvent.click(screen.getByRole("button", { name: /Register finding/ }));
    await vi.waitFor(() => expect(calls).toHaveLength(1));

    expect(calls[0].url).toMatch(/\/findings$/);
    expect(calls[0].body).toEqual({
      comparison_id: WORKSPACE_FRESH.comparison!.comparison_id,
      expected_context_revision: WORKSPACE_FRESH.context_revision,
      confirmed_intended_comparison: true,
    });
  });

  it("sends an unticked confirmation as unconfirmed rather than hiding the action", async () => {
    const calls: Call[] = [];
    stubFetch(calls);
    render(<DeskStage context={context(WORKSPACE_FRESH, ari)} />);

    fireEvent.click(screen.getByRole("button", { name: /Use this finding/ }));
    fireEvent.click(screen.getByRole("button", { name: /Register finding/ }));
    await vi.waitFor(() => expect(calls).toHaveLength(1));
    expect(calls[0].body).toMatchObject({ confirmed_intended_comparison: false });
  });

  it("inserts the linked finding with the style the server approved for each report", async () => {
    const calls: Call[] = [];
    stubFetch(calls);
    const workspace = WORKSPACE_FINDING_REGISTERED;
    const finding = workspace.findings![0];
    render(<DeskStage context={context(workspace, ari)} />);

    for (const doc of workspace.scope) {
      fireEvent.click(
        screen.getByRole("button", { name: `Insert linked finding into ${doc.title}` }),
      );
    }
    await vi.waitFor(() => expect(calls).toHaveLength(workspace.scope.length));
    expect(calls.map((call) => [call.url.replace(/^.*\/documents\//, ""), call.body])).toEqual(
      workspace.scope.map((doc) => [
        `${doc.document_id}/linked-findings`,
        {
          claim_id: finding.claim_id,
          card_style: doc.approved_card_style,
          expected_context_revision: workspace.context_revision,
        },
      ]),
    );
  });

  it("records the basis only on an explicit, confirmed request", async () => {
    const calls: Call[] = [];
    stubFetch(calls);
    const workspace = WORKSPACE_PLACED_NO_BASIS;
    render(<DeskStage context={context(workspace, ari)} />);

    expect(screen.queryByRole("button", { name: /Insert linked finding/ })).toBeNull();
    fireEvent.click(screen.getByRole("checkbox", { name: /This finding is a basis for the/ }));
    fireEvent.click(screen.getByRole("button", { name: /Record as decision basis/ }));
    await vi.waitFor(() => expect(calls).toHaveLength(1));
    expect(calls[0].url).toMatch(new RegExp(`/decisions/${workspace.decision!.decision_id}/basis$`));
    expect(calls[0].body).toEqual({
      claim_id: workspace.findings![0].claim_id,
      expected_context_revision: workspace.context_revision,
      confirmed_basis: true,
    });
  });

  it("lets a signed-in reviewer try, so the server gives the real refusal", async () => {
    const calls: Call[] = [];
    stubFetch(calls);
    render(<DeskStage context={context(WORKSPACE_FINDING_REGISTERED, noor)} />);
    const insert = screen.getAllByRole("button", { name: /Insert linked finding/ });
    expect(insert.length).toBeGreaterThan(0);
    fireEvent.click(insert[0]);
    await vi.waitFor(() => expect(calls).toHaveLength(1));
    expect(calls[0].url).toMatch(/\/linked-findings$/);
  });

  it("offers no authoring action to a visitor without a session", () => {
    render(<DeskStage context={context(WORKSPACE_FINDING_REGISTERED, null)} />);
    expect(screen.queryByRole("button", { name: /Use this finding|Insert linked finding/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /Record as decision basis/ })).toBeNull();
  });

  it("keeps the published desk for a workspace that already has an edition", () => {
    render(<DeskStage context={context(WORKSPACE_V1, ari)} />);
    expect(screen.getByText(/One finding, two reports/)).toBeTruthy();
    expect(screen.queryByRole("region", { name: "Comparison" })).toBeNull();
  });
});

describe("the evidence graph draws only authored links", () => {
  it("draws no finding, use or basis before any is registered", () => {
    expect(sceneLinks(WORKSPACE_FRESH)).toEqual({
      finding: false,
      ops: false,
      memo: false,
      basis: false,
    });
  });

  it("draws each link once the server reports it", () => {
    expect(sceneLinks(WORKSPACE_FINDING_REGISTERED)).toEqual({
      finding: true,
      ops: false,
      memo: false,
      basis: false,
    });
    expect(sceneLinks(WORKSPACE_PLACED_NO_BASIS)).toEqual({
      finding: true,
      ops: true,
      memo: true,
      basis: false,
    });
    expect(sceneLinks(WORKSPACE_V1)).toEqual({ finding: true, ops: true, memo: true, basis: true });
  });
});
