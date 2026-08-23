import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { cohortSchema, pilotSchema } from "../src/schema";

const packageRoot = join(import.meta.dir, "..");

function staticImportGraph(entry: string): Set<string> {
  const visited = new Set<string>();
  const visit = (path: string): void => {
    if (visited.has(path)) return;
    visited.add(path);

    const contents = readFileSync(path, "utf8");
    const imports = contents.matchAll(
      /(?:^|\n)\s*(?:import|export)\s+(?:type\s+)?(?:[^"']*?\s+from\s+)?["'](\.[^"']+)["']/g,
    );
    for (const match of imports) {
      const reference = match[1];
      if (!reference) continue;
      const unresolved = resolve(dirname(path), reference);
      const dependency = [
        unresolved,
        `${unresolved}.ts`,
        `${unresolved}.tsx`,
        join(unresolved, "index.ts"),
      ].find((candidate) => existsSync(candidate));
      if (dependency) visit(dependency);
    }
  };

  visit(join(packageRoot, entry));
  return visited;
}

const canonicalPilot = {
  brainVersion: "0.2.0-alpha.231",
  bundleContract: "capability-bundles-v1",
  bundles: [
    "core",
    "media",
    "automation",
    "web",
    "chat",
    "site",
    "publishing",
    "federation",
  ],
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
    const { bundleContract: _bundleContract, ...unversionedPilot } =
      canonicalPilot;
    expect(pilotSchema.safeParse(unversionedPilot).success).toBe(false);
    expect(
      pilotSchema.safeParse({ ...canonicalPilot, schemaVersion: 1 }).success,
    ).toBe(false);
    expect(
      pilotSchema.safeParse({
        schemaVersion: 1,
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

  test("keeps offline pilot migration outside the active ops graph", () => {
    const graph = staticImportGraph("src/index.ts");

    expect(graph.has(join(packageRoot, "src/stage-legacy-crossover.ts"))).toBe(
      false,
    );
    expect(graph.has(join(packageRoot, "src/legacy-pilot-migration.ts"))).toBe(
      false,
    );
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

    expect(indexSource).not.toContain("schemaVersion");
    expect(loaderSource).not.toMatch(/\bmodel\b|\bpreset\b/);
    expect(rendererSource).toContain('"brain: brain"');
    expect(rendererSource).toContain("bundles:");
    expect(rendererSource).not.toMatch(/\bmodel\b|\bpreset\b/);
  });
});
