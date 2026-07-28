import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { cohortSchema, pilotSchema } from "../src/schema";

const canonicalPilot = {
  schemaVersion: 2,
  brainVersion: "0.2.0-alpha.231",
  bundles: ["core", "site", "publishing"],
  add: ["obsidian-vault"],
  remove: [
    "series",
    "portfolio",
    "content-pipeline",
    "social-media",
    "newsletter",
    "stock-photo",
  ],
  githubOrg: "rizom-ai",
  contentRepoPrefix: "rover-",
  domainSuffix: ".rizom.ai",
  aiApiKey: "PILOT_AI_API_KEY",
  gitSyncToken: "PILOT_GIT_SYNC_TOKEN",
  contentRepoAdminToken: "CONTENT_REPO_ADMIN_TOKEN",
  agePublicKey: "age1pilotpublickey",
} as const;

const canonicalCohort = {
  members: ["alice"],
  bundlesOverride: ["core", "team"],
} as const;

describe("ops clean canonical crossover", () => {
  test("promotes the canonical desired-state schemas as the only active contract", () => {
    expect(pilotSchema.safeParse(canonicalPilot).success).toBe(true);
    expect(cohortSchema.safeParse(canonicalCohort).success).toBe(true);
    expect(
      pilotSchema.safeParse({
        schemaVersion: 2,
        brainVersion: "0.2.0-alpha.231",
        model: "rover",
        preset: "default",
        githubOrg: "rizom-ai",
        contentRepoPrefix: "rover-",
        domainSuffix: ".rizom.ai",
        aiApiKey: "PILOT_AI_API_KEY",
        gitSyncToken: "PILOT_GIT_SYNC_TOKEN",
        contentRepoAdminToken: "CONTENT_REPO_ADMIN_TOKEN",
        agePublicKey: "age1pilotpublickey",
      }).success,
    ).toBe(false);
  });

  test("keeps legacy parsing private to offline migration", () => {
    const indexSource = readFileSync(
      join(import.meta.dir, "../src/index.ts"),
      "utf8",
    );
    const loaderSource = readFileSync(
      join(import.meta.dir, "../src/load-registry.ts"),
      "utf8",
    );
    const rendererSource = readFileSync(
      join(import.meta.dir, "../src/default-user-runner.ts"),
      "utf8",
    );

    expect(indexSource).not.toMatch(/pilotSchemaV2|cohortSchemaV2/);
    expect(loaderSource).not.toMatch(/\bmodel\b|\bpreset\b/);
    expect(rendererSource).toContain('"brain: brain"');
    expect(rendererSource).toContain("bundles:");
    expect(rendererSource).not.toMatch(/\bmodel\b|\bpreset\b/);
  });
});
