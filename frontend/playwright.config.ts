import { defineConfig, devices } from "@playwright/test";

/**
 * The browser suite stays small, as CLAUDE.md requires: a real correction,
 * review and download, same-case stale-authority recovery, a denied approval
 * and scope visibility.
 *
 * It drives the real application against a real API and a real FalkorDB. It
 * seeds nothing and stubs nothing, so it needs a workspace that has been seeded
 * with `python -m scripts.seed_demo --reset` and the demo passcodes exported:
 *
 *   RR_BASE_URL=http://localhost:5191
 *   RR_PASSCODE_ARI / RR_PASSCODE_NOOR / RR_PASSCODE_SAM / RR_PASSCODE_OPERATOR
 *
 * Passcodes are read from the environment and never committed.
 */
export default defineConfig({
  testDir: "./e2e",
  timeout: 120_000,
  expect: { timeout: 20_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"]],
  use: {
    baseURL: process.env.RR_BASE_URL ?? "http://localhost:5191",
    viewport: { width: 1920, height: 1080 },
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
