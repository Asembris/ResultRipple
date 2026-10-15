import { expect, test, type Page } from "@playwright/test";

/**
 * Authoring on a fresh workspace, in a real browser, against the real API and
 * FalkorDB. The workspace starts with no finding, no occurrence, no decision
 * basis and no edition (`python -m scripts.seed_demo --fresh` into an empty
 * graph). The analyst registers and reuses the finding, records the basis, and
 * the first edition is issued through the real staging, approval and release
 * path. No agent is involved, so no NVIDIA credential is needed.
 */

const PASSCODES: Record<string, string | undefined> = {
  "Ari Mensah": process.env.RR_PASSCODE_ARI,
  "Noor Haddad": process.env.RR_PASSCODE_NOOR,
};

interface WorkspaceBody {
  context_revision: number;
  comparison: { comparison_id: string; sentence?: string } | null;
  findings?: { claim_id: string; occurrences: { document_id: string; card_style: string }[] }[];
  decision: { status: string; basis_claim_id: string | null } | null;
  cases: { source_ref: string }[];
  current_release: { release_id: string; sequence: number; document_ids: string[] } | null;
}

test.describe.configure({ mode: "serial" });

test.beforeAll(async ({ request }) => {
  const missing = Object.entries(PASSCODES)
    .filter(([, value]) => !value)
    .map(([name]) => name);
  test.skip(missing.length > 0, `Set RR_PASSCODE_* for: ${missing.join(", ")}.`);

  const response = await request.get("/api/workspace");
  test.skip(!response.ok(), `GET /workspace returned ${response.status()}. Start the API first.`);
  const workspace = (await response.json()) as WorkspaceBody;
  const fresh =
    workspace.cases.some((entry) => entry.source_ref === "INITIAL-PUBLICATION") &&
    (workspace.findings ?? []).length === 0 &&
    workspace.current_release === null;
  test.skip(
    !fresh,
    "This suite needs an authoring-start workspace. Seed an empty graph with: " +
      "FALKORDB_GRAPH=<new graph> python -m scripts.seed_demo --fresh",
  );
});

const panel = (page: Page) => page.getByRole("complementary", { name: /workflow/i });

async function waitForApp(page: Page) {
  await page.goto("/");
  await expect(panel(page)).toBeVisible({ timeout: 30_000 });
  await expect(page.locator(".rr-intro")).toHaveCount(0, { timeout: 20_000 });
}

async function signIn(page: Page, displayName: string) {
  const nav = page.getByRole("navigation", { name: /demo identities/i });
  await nav.getByRole("button", { name: new RegExp(displayName) }).click();
  await page.getByLabel(new RegExp(`Passcode for ${displayName}`)).fill(PASSCODES[displayName]!);
  await page.getByRole("button", { name: /^Sign in/ }).click();
  await expect(nav.getByRole("button", { name: new RegExp(displayName) })).toHaveClass(
    /rr-chip--active/,
    { timeout: 20_000 },
  );
}

async function workspace(page: Page): Promise<WorkspaceBody> {
  const response = await page.request.get("/api/workspace");
  expect(response.ok()).toBeTruthy();
  return (await response.json()) as WorkspaceBody;
}

test("an analyst authors the finding and the first edition is issued", async ({ page }) => {
  await waitForApp(page);
  const before = await workspace(page);

  // 1. The comparison view shows the server's own sentence; nothing is linked.
  await expect(panel(page).getByText("Register the finding once, then reuse it.")).toBeVisible();
  const comparison = panel(page).getByRole("region", { name: "Comparison" });
  await expect(comparison.getByText(before.comparison!.sentence!)).toBeVisible();
  await expect(panel(page).getByText("not linked")).toHaveCount(2);

  // 2. Register the finding from the displayed comparison.
  await signIn(page, "Ari Mensah");
  await comparison.getByRole("button", { name: /Use this finding/ }).click();
  await comparison.getByText("This is the intended comparison.").click();
  await comparison.getByRole("button", { name: /Register finding/ }).click();
  await expect(comparison.getByText(/^Registered finding · /)).toBeVisible({ timeout: 20_000 });

  // 3. Reuse it in both reports, each with its approved style.
  await panel(page)
    .getByRole("button", { name: "Insert linked finding into Operations Cost Review" })
    .click();
  await expect(panel(page).getByText("linked · DOLLARS")).toBeVisible({ timeout: 20_000 });
  await panel(page)
    .getByRole("button", { name: "Insert linked finding into South Expansion Memo" })
    .click();
  await expect(panel(page).getByText("linked · CENTS")).toBeVisible({ timeout: 20_000 });

  // 4. Record it, explicitly, as the decision basis.
  await panel(page).getByText(/^This finding is a basis for the /).click();
  await panel(page).getByRole("button", { name: /Record as decision basis/ }).click();
  await expect(panel(page).getByText("basis recorded")).toBeVisible({ timeout: 20_000 });

  // The graph now holds exactly one finding, two placements and the basis.
  const authored = await workspace(page);
  expect(authored.findings).toHaveLength(1);
  const finding = authored.findings![0];
  expect(finding.occurrences.map((occ) => occ.card_style).sort()).toEqual(["CENTS", "DOLLARS"]);
  expect(authored.decision?.basis_claim_id).toBe(finding.claim_id);
  expect(authored.context_revision).toBe(before.context_revision + 4);

  // 5. The initial publication goes through staging, approval and release.
  const publication = panel(page).getByRole("region", { name: "Initial publication" });
  await publication.getByRole("button", { name: /Prepare initial publication/ }).click();
  await expect(publication.getByText(/plan v1 · awaiting review · reviewer Noor Haddad/)).toBeVisible({
    timeout: 30_000,
  });

  await signIn(page, "Noor Haddad");
  await publication.getByRole("button", { name: /Approve revision as Noor Haddad/ }).click();
  await expect(publication.getByText(/plan v1 · approved/)).toBeVisible({ timeout: 20_000 });
  await publication.getByRole("button", { name: /Issue editions as Noor Haddad/ }).click();

  // 6. The desk now describes a published package: Version 1 is current.
  await expect(panel(page).getByText(/One finding, two reports/)).toBeVisible({ timeout: 60_000 });
  await expect(panel(page).getByText(/Version 1 is current/)).toBeVisible();

  const issued = await workspace(page);
  expect(issued.current_release?.sequence).toBe(1);
  expect(issued.decision?.status).toBe("PROPOSED");
  const expected: Record<string, string> = {
    "doc-operations-cost-review": "South costs $0.40 less per parcel than North.",
    "doc-south-expansion-memo": "South is 40 cents cheaper per parcel than North.",
  };
  expect([...issued.current_release!.document_ids].sort()).toEqual(Object.keys(expected).sort());
  for (const [documentId, sentence] of Object.entries(expected)) {
    const edition = await page.request.get(
      `/api/editions/${issued.current_release!.release_id}/${documentId}`,
    );
    expect(edition.ok()).toBeTruthy();
    const body = await edition.text();
    expect(body).toContain(`data-claim-id="${finding.claim_id}"`);
    expect(body).toContain(sentence);
  }
});
