import { expect, test, type Page } from "@playwright/test";

/**
 * The real workflow, in a real browser, against the real API and FalkorDB.
 *
 * Nothing here is stubbed. Each step asserts on what the server returned, and
 * the negative cases assert that the server refused and that nothing changed.
 */

const PASSCODES: Record<string, string | undefined> = {
  "Ari Mensah": process.env.RR_PASSCODE_ARI,
  "Noor Haddad": process.env.RR_PASSCODE_NOOR,
  "Sam Oyelaran": process.env.RR_PASSCODE_SAM,
  "Demo Operator": process.env.RR_PASSCODE_OPERATOR,
};

// One real case moves through one workspace, so the steps run in order and a
// failure stops the rest rather than reporting cascading noise.
test.describe.configure({ mode: "serial" });

test.beforeAll(async ({ request }) => {
  const missing = Object.entries(PASSCODES)
    .filter(([, value]) => !value)
    .map(([name]) => name);
  test.skip(
    missing.length > 0,
    `Set RR_PASSCODE_* for: ${missing.join(", ")}. The suite drives the real API and never ships credentials.`,
  );

  // The suite starts the story from the beginning and cannot reset the
  // workspace: there is no reset endpoint, by design. Check the precondition
  // and say plainly what to run, rather than failing somewhere in the middle.
  const response = await request.get("/api/workspace");
  test.skip(!response.ok(), `GET /workspace returned ${response.status()}. Start the API first.`);
  const workspace = (await response.json()) as {
    cases: { source_ref: string; status: string }[];
    current_release: { sequence: number } | null;
  };
  const kase = workspace.cases.find((entry) => entry.source_ref === "DX-2026-0914");
  const fresh = kase?.status === "CORRECTION_PENDING" && workspace.current_release?.sequence === 1;
  test.skip(
    !fresh,
    `The workspace has already moved on (case ${kase?.status}, release ${workspace.current_release?.sequence}). ` +
      "Reseed with: python -m scripts.seed_demo --reset",
  );
});

async function waitForApp(page: Page) {
  await page.goto("/");
  await expect(page.getByRole("complementary", { name: /workflow/i })).toBeVisible({
    timeout: 30_000,
  });
  // Let the opening sequence hand off before driving the chrome.
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

const panel = (page: Page) => page.getByRole("complementary", { name: /workflow/i });

test("the correction, review and download run on real data", async ({ page }) => {
  await waitForApp(page);

  // 1. The desk publishes what the current edition actually says.
  await expect(panel(page).getByText(/One finding, two reports/)).toBeVisible();
  await expect(panel(page).getByText(/Two registered finding occurrences/)).toBeVisible();

  // 2. The analyst confirms the correction against its source.
  await signIn(page, "Ari Mensah");
  await panel(page).getByRole("button", { name: /Review the correction/ }).click();
  await expect(panel(page).getByText(/logged against the wrong lane/)).toBeVisible();
  await panel(page).getByRole("button", { name: /Confirm correction against this source/ }).click();

  // The reversal is the server's, and both registered uses are contradicted.
  await expect(panel(page).getByText("DIRECTION CHANGED").first()).toBeVisible({ timeout: 30_000 });
  await expect(panel(page).getByText("BASIS CONTRADICTED")).toBeVisible();

  // 3. A real agent run stages the review.
  await panel(page).getByRole("button", { name: /Ask the agent to prepare the review/ }).click();
  const agent = page.getByRole("region", { name: /Ask the agent/i });
  await agent.getByRole("button", { name: /Run agent/ }).click();
  const labels = agent.locator(".rr-trip__label");
  await expect(labels).toHaveCount(3, { timeout: 60_000 });
  await expect(labels).toHaveText(["Requested", "Evidence", "Proposed"]);
  await expect(agent.getByText(/unassessed commentary/)).toBeVisible();

  // 4. An unacknowledged alternative is refused by the server, not by the page.
  await signIn(page, "Noor Haddad");
  await page.getByRole("button", { name: /View step 4: Review/ }).click();
  await panel(page).getByRole("button", { name: /Approve revision as/ }).click();
  await expect(page.getByText("ALTERNATIVE_NOT_ACKNOWLEDGED")).toBeVisible();

  // 5. Acknowledged, the assigned reviewer's approval is recorded.
  await panel(page).getByText(/I acknowledge the proposed alternative/).click();
  await panel(page).getByRole("button", { name: /Approve revision as/ }).click();
  await expect(panel(page).getByText(/^Approved by /)).toBeVisible({ timeout: 30_000 });
});

test("a once-valid approval is refused after the authority changes", async ({ page }) => {
  await waitForApp(page);

  // The operator moves the one edge that decides whose approval counts.
  await signIn(page, "Demo Operator");
  await page.getByRole("button", { name: /View step 5: Authority/ }).click();
  await panel(page).getByRole("button", { name: /Reassign review authority to/ }).click();
  await expect(panel(page).getByText(/no longer current/i)).toBeVisible({ timeout: 30_000 });

  // The previous reviewer may still try. The server refuses with a witness.
  await signIn(page, "Noor Haddad");
  await page.getByRole("button", { name: /View step 6/ }).click();
  const issue = panel(page).getByRole("button", { name: /Issue editions as/ });
  await expect(issue).toBeEnabled();
  await issue.click();
  await expect(page.getByText("AUTHORITY_CHANGED")).toBeVisible({ timeout: 30_000 });
  await expect(page.locator(".rr-refusal__witness")).toContainText("current_reviewer_id");

  // Nothing was published by the refused attempt.
  const workspace = await page.evaluate(async () => {
    const response = await fetch("/api/workspace", { credentials: "include" });
    return (await response.json()) as { current_release: { sequence: number } | null };
  });
  expect(workspace.current_release?.sequence).toBe(1);

  // A reviewer-only refresh keeps the candidate bytes and routes a fresh review.
  await panel(page).getByRole("button", { name: /Refresh the review for/ }).click();
  await expect(panel(page).getByText("IDENTICAL")).toBeVisible({ timeout: 30_000 });

  // Document ownership is still not review authority.
  await panel(page).getByText(/I acknowledge the proposed alternative/).click();
  await panel(page).getByRole("button", { name: /Approve revision as/ }).click();
  await expect(page.getByText("NOT_AUTHORIZED")).toBeVisible();
});

test("the current reviewer finishes the case and both editions are real", async ({ page }) => {
  await waitForApp(page);

  await signIn(page, "Sam Oyelaran");
  await page.getByRole("button", { name: /View step 6/ }).click();
  await panel(page).getByText(/I acknowledge the proposed alternative/).click();
  await panel(page).getByRole("button", { name: /Approve revision as/ }).click();
  await expect(panel(page).getByText(/^Approved by /)).toBeVisible({ timeout: 30_000 });

  await panel(page).getByRole("button", { name: /Issue editions as/ }).click();
  await expect(panel(page).getByText(/corrected editions? (is|are) out/)).toBeVisible({
    timeout: 60_000,
  });

  // Both downloads are the backend's allowlisted edition endpoint.
  const links = panel(page).getByRole("link", { name: "Download" });
  await expect(links).toHaveCount(2);
  const download = page.waitForEvent("download");
  await links.first().click();
  const file = await download;
  expect(file.suggestedFilename()).toMatch(/\.html$/);

  // The scope statement stays; no general all-clear is ever shown.
  await expect(panel(page).getByText(/Editorial narrative not assessed/)).toBeVisible();
  await expect(page.getByText(/truth verified/i)).toHaveCount(0);
});
