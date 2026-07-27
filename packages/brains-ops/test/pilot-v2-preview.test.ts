import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseYamlDocument } from "@brains/utils/yaml";
import {
  cohortSchema,
  cohortSchemaV2,
  pilotSchema,
  pilotSchemaV2,
  type CohortConfig,
  type PilotConfig,
} from "../src/schema";
import {
  migrateCohortConfigV2,
  migratePilotConfigV2,
  renderCohortConfigV2,
  renderPilotConfigV2,
} from "../src/pilot-v2-preview";

const pilot: PilotConfig = pilotSchema.parse({
  schemaVersion: 1,
  brainVersion: "0.2.0-alpha.231",
  model: "rover",
  githubOrg: "rizom-ai",
  contentRepoPrefix: "rover-",
  domainSuffix: ".rizom.ai",
  preset: "default",
  aiApiKey: "PILOT_AI_API_KEY",
  gitSyncToken: "PILOT_GIT_SYNC_TOKEN",
  contentRepoAdminToken: "CONTENT_REPO_ADMIN_TOKEN",
  agePublicKey: "age1pilotpublickey",
});

const cohort: CohortConfig = cohortSchema.parse({
  members: ["alice", "bob"],
  brainVersionOverride: "0.2.0-alpha.232",
  presetOverride: "core",
  aiApiKeyOverride: "CANARY_AI_API_KEY",
  gitSyncTokenOverride: "CANARY_GIT_SYNC_TOKEN",
});

describe("opt-in pilot schema v2 preview", () => {
  test("moves pilot model/preset selection to explicit canonical bundles", () => {
    const migrated = migratePilotConfigV2(pilot);

    expect(migrated).toEqual({
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
    });
    expect("model" in migrated).toBe(false);
    expect("preset" in migrated).toBe(false);
    expect(pilotSchemaV2.parse(migrated)).toEqual(migrated);
    expect(
      pilotSchemaV2.safeParse({
        ...migrated,
        bundles: ["core", "core"],
      }).success,
    ).toBe(false);
    expect(() => pilotSchema.parse(migrated)).toThrow();
  });

  test("moves cohort preset overrides without changing members or selectors", () => {
    const migrated = migrateCohortConfigV2(cohort);

    expect(migrated).toEqual({
      members: ["alice", "bob"],
      brainVersionOverride: "0.2.0-alpha.232",
      bundlesOverride: ["core"],
      aiApiKeyOverride: "CANARY_AI_API_KEY",
      gitSyncTokenOverride: "CANARY_GIT_SYNC_TOKEN",
    });
    expect("presetOverride" in migrated).toBe(false);
    expect(cohortSchemaV2.parse(migrated)).toEqual(migrated);
    expect(
      cohortSchemaV2.safeParse({
        ...migrated,
        members: ["alice", "alice"],
      }).success,
    ).toBe(false);
  });

  test("renders deterministic v2 YAML without renaming repos or secrets", () => {
    const pilotYaml = renderPilotConfigV2(migratePilotConfigV2(pilot));
    const cohortYaml = renderCohortConfigV2(migrateCohortConfigV2(cohort));

    expect(pilotYaml).not.toContain("model:");
    expect(pilotYaml).not.toContain("preset:");
    expect(pilotYaml).toContain("schemaVersion: 2");
    expect(pilotYaml).toContain("contentRepoPrefix: rover-");
    expect(pilotYaml).toContain("aiApiKey: PILOT_AI_API_KEY");
    expect(pilotYaml).toContain("gitSyncToken: PILOT_GIT_SYNC_TOKEN");
    expect(cohortYaml).toContain("bundlesOverride:");
    expect(cohortYaml).toContain("CANARY_AI_API_KEY");

    const parsedPilot = parseYamlDocument(pilotYaml, pilotSchemaV2);
    const parsedCohort = parseYamlDocument(cohortYaml, cohortSchemaV2);
    expect(parsedPilot.ok).toBe(true);
    expect(parsedCohort.ok).toBe(true);
    expect(renderPilotConfigV2(migratePilotConfigV2(pilot))).toBe(pilotYaml);
    expect(renderCohortConfigV2(migrateCohortConfigV2(cohort))).toBe(
      cohortYaml,
    );
  });

  test("keeps schema v1 as the only active registry contract", () => {
    const activeLoader = readFileSync(
      join(import.meta.dir, "../src/load-registry.ts"),
      "utf8",
    );

    expect(pilotSchema.parse(pilot)).toEqual(pilot);
    expect(cohortSchema.parse(cohort)).toEqual(cohort);
    expect(pilotSchemaV2.safeParse(pilot).success).toBe(false);
    expect(cohortSchemaV2.safeParse(cohort).success).toBe(false);
    expect(activeLoader).toContain("pilotSchema");
    expect(activeLoader).toContain("cohortSchema");
    expect(activeLoader).not.toContain("pilotSchemaV2");
    expect(activeLoader).not.toContain("cohortSchemaV2");
  });
});
