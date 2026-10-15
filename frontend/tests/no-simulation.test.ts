import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * The prototype that the design came from simulated its backend. None of that
 * may ship: no invented agent events, no fabricated hashes or receipts, no
 * locally generated editions, and no local store standing in for workflow
 * authority.
 *
 * This reads the application source. The built bundle is checked the same way
 * by the build step in CI and before release.
 */

const SRC = join(__dirname, "..", "src");

/** Tokens from the prototype's simulation layer (INTEGRATION_MAP §3). */
const BANNED: { pattern: RegExp; why: string }[] = [
  { pattern: /AGENT_EVENTS/, why: "the prototype's scripted agent run" },
  { pattern: /\bPHASES\b/, why: "the prototype's local phase machine" },
  { pattern: /\bSTEP_OF\b|\bSTEP_START\b/, why: "the prototype's step table" },
  { pattern: /\bstageFor\b|\brevFor\b|\bpersonaFor\b/, why: "the prototype's derived fakes" },
  { pattern: /rr-v2-phase/, why: "the prototype's localStorage key" },
  { pattern: /editionHtml/, why: "a browser-generated edition" },
  { pattern: /4be019c7|9d7a55e1|7d2f9a1c|c91e4b7a/, why: "a fabricated hash" },
  { pattern: /simulated/i, why: "a simulated response label" },
  { pattern: /localStorage|sessionStorage/, why: "local storage as workflow state" },
];

/** Demo facts that must arrive from the API, never from the bundle. */
const LITERALS: { pattern: RegExp; why: string }[] = [
  { pattern: /Noor Haddad|Sam Oyelaran|Ari Mensah|Demo Operator/, why: "a person's name" },
  { pattern: /\$3\.60|\$4\.40|\$4\.00/, why: "a lane mean" },
  { pattern: /\bB09\b|\bB10\b|\bB11\b/, why: "a batch id" },
];

/**
 * The scene has two fixed person slots and two document slots. Mapping the
 * seeded ids onto them is the one place an id may be named, as the handoff's
 * integration map requires; the mapping falls back to the workspace's own
 * ordering when the ids differ, and carries no name, number or authority.
 */
const SLOT_TABLE = "graph/stageFromWorkspace.ts";

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.(ts|tsx|js|css)$/.test(entry) ? [path] : [];
  });
}

const files = sourceFiles(SRC).map((path) => ({
  path: path.slice(SRC.length + 1).replace(/\\/g, "/"),
  text: readFileSync(path, "utf8"),
}));

describe("no simulated workflow state ships", () => {
  it("finds application source to check", () => {
    expect(files.length).toBeGreaterThan(10);
  });

  for (const { pattern, why } of BANNED) {
    it(`carries no ${why}`, () => {
      const hits = files.filter((file) => pattern.test(file.text)).map((file) => file.path);
      expect(hits).toEqual([]);
    });
  }

  for (const { pattern, why } of LITERALS) {
    it(`never hardcodes ${why}`, () => {
      const hits = files
        .filter((file) => {
          // Comments may name the demo when explaining a mapping; code may not.
          const code = file.text
            .replace(/\/\*[\s\S]*?\*\//g, "")
            .replace(/^\s*\/\/.*$/gm, "")
            .replace(/^\s*\*.*$/gm, "");
          return pattern.test(code);
        })
        .map((file) => file.path);
      expect(hits).toEqual([]);
    });
  }

  it("names a person id only in the scene's slot table", () => {
    const hits = files
      .filter((file) => /person-[a-z]+/.test(file.text))
      .map((file) => file.path);
    expect(hits).toEqual([SLOT_TABLE]);
  });

  it("keeps the slot table free of names, numbers and authority", () => {
    const table = files.find((file) => file.path === SLOT_TABLE);
    expect(table).toBeDefined();
    const code = (table?.text ?? "")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/^\s*\/\/.*$/gm, "");
    expect(/Noor|Sam|Ari/.test(code)).toBe(false);
    // The slot ids appear only in the two declared constants.
    const occurrences = code.match(/person-[a-z]+/g) ?? [];
    expect(occurrences).toEqual(["person-noor", "person-sam"]);
  });

  it("ships no passcode or credential", () => {
    const hits = files
      .filter((file) => /passcode\s*[:=]\s*["'][^"']+["']/i.test(file.text))
      .map((file) => file.path);
    expect(hits).toEqual([]);
  });
});
