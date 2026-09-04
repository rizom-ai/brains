import { describe, expect, test } from "bun:test";
import { parseYamlDocument } from "@brains/utils/yaml";
import {
  migrateLegacyCohortConfig,
  migrateLegacyPilotConfig,
  renderCohortConfig,
  renderPilotConfig,
} from "../src/legacy-pilot-migration";
import { cohortSchema, pilotSchema } from "../src/schema";

const legacyPilot = {
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
};

const legacyCohort = {
  members: ["alice", "bob"],
  brainVersionOverride: "0.2.0-alpha.232",
  presetOverride: "core",
  aiApiKeyOverride: "CANARY_AI_API_KEY",
  gitSyncTokenOverride: "CANARY_GIT_SYNC_TOKEN",
};

describe("offline legacy pilot migration", () => {
  test("converts pilot selection to canonical desired state", () => {
    const migrated = migrateLegacyPilotConfig(legacyPilot);

    expect(migrated).toEqual({
      brainVersion: "0.2.0-alpha.231",
      bundleContract: "capability-bundles-v1",
      imageContract: "isolated-sites-v1",
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
    });
    expect(pilotSchema.parse(migrated)).toEqual(migrated);
    expect(pilotSchema.safeParse(legacyPilot).success).toBe(false);
  });

  test("converts cohort selection without changing members or selectors", () => {
    const migrated = migrateLegacyCohortConfig(legacyCohort);

    expect(migrated).toEqual({
      members: ["alice", "bob"],
      brainVersionOverride: "0.2.0-alpha.232",
      bundlesOverride: ["core", "media", "web", "chat"],
      aiApiKeyOverride: "CANARY_AI_API_KEY",
      gitSyncTokenOverride: "CANARY_GIT_SYNC_TOKEN",
    });
    expect(cohortSchema.parse(migrated)).toEqual(migrated);
    expect(cohortSchema.safeParse(legacyCohort).success).toBe(false);
  });

  test("renders deterministic canonical YAML", () => {
    const pilotYaml = renderPilotConfig(migrateLegacyPilotConfig(legacyPilot));
    const cohortYaml = renderCohortConfig(
      migrateLegacyCohortConfig(legacyCohort),
    );

    expect(pilotYaml).not.toContain("model:");
    expect(pilotYaml).not.toContain("preset:");
    expect(pilotYaml).not.toContain("schemaVersion:");
    expect(pilotYaml).toContain("bundleContract: capability-bundles-v1");
    expect(pilotYaml).toContain("imageContract: isolated-sites-v1");
    expect(pilotYaml).toContain("contentRepoPrefix: rover-");
    expect(cohortYaml).toContain("bundlesOverride:");
    expect(parseYamlDocument(pilotYaml, pilotSchema).ok).toBe(true);
    expect(parseYamlDocument(cohortYaml, cohortSchema).ok).toBe(true);
  });
});
