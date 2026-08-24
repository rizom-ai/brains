import { describe, expect, test } from "bun:test";
import {
  migrateCanonicalCohortYaml,
  migrateCanonicalPilotYaml,
  parseCapabilityBundleReview,
} from "../src/capability-bundle-migration";
import { cohortSchema, pilotSchema } from "../src/schema";
import { parseYamlDocument } from "@brains/utils/yaml";

const review =
  parseCapabilityBundleReview(`bundleContract: capability-bundles-v1
pilot:
  sourceBundles: [core]
  targetBundles: [core, media, web, chat]
cohorts:
  sites:
    sourceBundles: [core, site, publishing]
    targetBundles: [core, media, automation, web, chat, site, publishing, federation]
`);

const pilotYaml = `# Preserve operator context.
brainVersion: 0.2.0-alpha.279
githubOrg: rizom-ai
contentRepoPrefix: rover-
domainSuffix: .rizom.ai
bundles:
  - core
aiApiKey: AI_API_KEY
gitSyncToken: GIT_SYNC_TOKEN
contentRepoAdminToken: CONTENT_REPO_ADMIN_TOKEN
agePublicKey: age1pilotpublickey
`;

describe("capability bundle desired-state migration", () => {
  test("requires reviewed source and target selections", () => {
    expect(review).toEqual({
      bundleContract: "capability-bundles-v1",
      pilot: {
        sourceBundles: ["core"],
        targetBundles: ["core", "media", "web", "chat"],
      },
      cohorts: {
        sites: {
          sourceBundles: ["core", "site", "publishing"],
          targetBundles: [
            "core",
            "media",
            "automation",
            "web",
            "chat",
            "site",
            "publishing",
            "federation",
          ],
        },
      },
    });
  });

  test("marks and rewrites the pilot selection without losing comments", () => {
    const migrated = migrateCanonicalPilotYaml(pilotYaml, review.pilot);

    expect(migrated).toContain("# Preserve operator context.");
    expect(migrated).toContain("bundleContract: capability-bundles-v1");
    expect(parseYamlDocument(migrated, pilotSchema).ok).toBe(true);
  });

  test("rewrites only explicitly selected cohorts", () => {
    const migrated = migrateCanonicalCohortYaml(
      `# Hosted sites.
bundlesOverride: [core, site, publishing]
addOverride: [obsidian-vault]
members: [docs]
`,
      "sites",
      review.cohorts["sites"],
    );
    const inheriting = migrateCanonicalCohortYaml(
      "members: [alice]\n",
      "steady",
      undefined,
    );

    expect(migrated).toContain("# Hosted sites.");
    expect(migrated).toContain("  - federation");
    expect(migrated).toContain("addOverride:");
    expect(parseYamlDocument(migrated, cohortSchema).ok).toBe(true);
    expect(parseYamlDocument(inheriting, cohortSchema).ok).toBe(true);
  });

  test("fails closed on source drift or an unreviewed explicit cohort", () => {
    expect(() =>
      migrateCanonicalPilotYaml(
        pilotYaml.replace("  - core\n", "  - core\n  - site\n"),
        review.pilot,
      ),
    ).toThrow(/source bundles changed after review/);
    expect(() =>
      migrateCanonicalCohortYaml(
        "bundlesOverride: [core, site, publishing]\nmembers: [docs]\n",
        "sites",
        undefined,
      ),
    ).toThrow(/no reviewed mapping/);
    expect(() =>
      migrateCanonicalCohortYaml(
        "members: [alice]\n",
        "steady",
        review.cohorts["sites"],
      ),
    ).toThrow(/names inheriting cohort/);
  });
});
