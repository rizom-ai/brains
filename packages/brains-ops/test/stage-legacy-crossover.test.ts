import { createTempDir } from "@brains/test-utils";
import { describe, expect, test } from "bun:test";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  parseReviewedSitePins,
  stageLegacyCrossover,
} from "../src/stage-legacy-crossover";
import { parseCapabilityBundleReview } from "../src/capability-bundle-migration";

describe("stageLegacyCrossover", () => {
  test("parses only fully pinned reviewed hosted sites", () => {
    expect(
      parseReviewedSitePins(`sites:
  alice:
    package: "@rizom/site-alice"
    version: 0.2.0-alpha.231
    theme: "@rizom/theme-alice"
    themeVersion: 0.2.0-alpha.230
`),
    ).toEqual({
      alice: {
        package: "@rizom/site-alice",
        version: "0.2.0-alpha.231",
        theme: "@rizom/theme-alice",
        themeVersion: "0.2.0-alpha.230",
      },
    });
    expect(() =>
      parseReviewedSitePins(`sites:
  alice:
    package: "@rizom/site-alice"
`),
    ).toThrow("Invalid reviewed site pins");
  });

  test("creates a complete canonical review copy without touching the source", async () => {
    const root = await createTempDir("ops-crossover-stage-");
    const source = join(root, "source");
    const output = join(root, "output");
    await mkdir(join(source, "cohorts"), { recursive: true });
    await mkdir(join(source, "users"), { recursive: true });
    await mkdir(join(source, ".brains-ops", "age"), { recursive: true });
    await mkdir(join(source, "dist"), { recursive: true });
    const legacyPilot = `# Pilot identity must survive migration.
schemaVersion: 1
brainVersion: 0.2.0-alpha.231
model: rover # Retired model selector.
githubOrg: rizom-ai
contentRepoPrefix: rover-
domainSuffix: .rizom.ai
preset: default # Retired selection.
aiApiKey: PILOT_AI_API_KEY
gitSyncToken: PILOT_GIT_SYNC_TOKEN
contentRepoAdminToken: CONTENT_REPO_ADMIN_TOKEN
agePublicKey: age1pilotpublickey
`;
    await writeFile(join(source, "pilot.yaml"), legacyPilot);
    await writeFile(join(source, ".env"), "SECRET=value\n");
    await writeFile(
      join(source, ".brains-ops", "age", "identity.txt"),
      "AGE-SECRET-KEY-test\n",
    );
    await writeFile(
      join(source, "users", "alice.secrets.yaml"),
      "discordBotToken: secret\n",
    );
    await writeFile(join(source, "dist", "bundle.js"), "build artifact\n");
    await writeFile(
      join(source, "cohorts", "canary.yaml"),
      "# Canary rollout identity.\nmembers:\n  - alice\npresetOverride: core # Retired cohort selection.\n",
    );
    const legacyUser = `handle: alice
siteOverride:
  package: "@rizom/site-alice"
  theme: "@rizom/theme-alice"
  themeVersion: 0.2.0-alpha.230 # Preserve the deployed theme pin.
discord:
  enabled: false
`;
    await writeFile(join(source, "users", "alice.yaml"), legacyUser);

    const staged = await stageLegacyCrossover(source, output, {
      sitePins: {
        alice: {
          package: "@rizom/site-alice",
          version: "0.2.0-alpha.231",
          theme: "@rizom/theme-alice",
          themeVersion: "0.2.0-alpha.230",
        },
      },
    });

    expect(await readFile(join(source, "pilot.yaml"), "utf8")).toBe(
      legacyPilot,
    );
    const stagedPilot = await readFile(join(output, "pilot.yaml"), "utf8");
    expect(stagedPilot).not.toContain("schemaVersion:");
    expect(stagedPilot).toContain("# Pilot identity must survive migration.");
    expect(stagedPilot).toContain("# Retired model selector.");
    expect(stagedPilot).toContain("# Retired selection.");
    const stagedCohort = await readFile(
      join(output, "cohorts", "canary.yaml"),
      "utf8",
    );
    expect(stagedCohort).toContain("# Canary rollout identity.");
    expect(stagedCohort).toContain("# Retired cohort selection.");
    const stagedUser = await readFile(
      join(output, "users", "alice.yaml"),
      "utf8",
    );
    expect(stagedUser).toContain("version: 0.2.0-alpha.231");
    expect(stagedUser).toContain("themeVersion: 0.2.0-alpha.230");
    expect(stagedUser).toContain("# Preserve the deployed theme pin.");
    expect(await readFile(join(source, "users", "alice.yaml"), "utf8")).toBe(
      legacyUser,
    );
    const stagedBrain = await readFile(
      join(output, "users", "alice", "brain.yaml"),
      "utf8",
    );
    expect(stagedBrain).toContain("brain: brain");
    expect(stagedBrain).toContain("bundles:\n  - core");
    expect(await Bun.file(join(output, ".env")).exists()).toBe(false);
    expect(await Bun.file(join(output, ".brains-ops")).exists()).toBe(false);
    expect(await Bun.file(join(output, "dist")).exists()).toBe(false);
    expect(
      await Bun.file(join(output, "users", "alice.secrets.yaml")).exists(),
    ).toBe(false);
    expect(
      await Bun.file(join(output, "users", "alice", ".env")).exists(),
    ).toBe(true);
    expect(
      await Bun.file(
        join(output, "docs", "canonical-crossover-record.md"),
      ).exists(),
    ).toBe(true);
    expect(staged.changedFiles).toEqual(
      expect.arrayContaining([
        "pilot.yaml",
        "cohorts/canary.yaml",
        "docs/canonical-crossover-record.md",
        "users/alice.yaml",
        "users/alice/brain.yaml",
        "views/users.md",
      ]),
    );
  });

  test("stages the current pilot only from an explicit source-to-target review", async () => {
    const root = await createTempDir("ops-capability-crossover-");
    const source = join(root, "source");
    const output = join(root, "output");
    await mkdir(join(source, "cohorts"), { recursive: true });
    await mkdir(join(source, "users"), { recursive: true });
    await writeFile(
      join(source, "pilot.yaml"),
      `brainVersion: 0.2.0-alpha.279
githubOrg: rizom-ai
contentRepoPrefix: rover-
domainSuffix: .rizom.ai
bundles: [core]
aiApiKey: AI_API_KEY
gitSyncToken: GIT_SYNC_TOKEN
contentRepoAdminToken: CONTENT_REPO_ADMIN_TOKEN
agePublicKey: age1pilotpublickey
`,
    );
    await writeFile(
      join(source, "cohorts", "steady.yaml"),
      "members: [alice]\n",
    );
    await writeFile(
      join(source, "cohorts", "sites.yaml"),
      "bundlesOverride: [core, site, publishing]\nmembers: [docs]\n",
    );
    await writeFile(
      join(source, "users", "alice.yaml"),
      "handle: alice\ndiscord:\n  enabled: false\n",
    );
    await writeFile(
      join(source, "users", "docs.yaml"),
      `handle: docs
siteOverride:
  package: "@rizom/site-docs"
  version: 0.2.0-alpha.237
  theme: "@rizom/theme-rizom-ai"
  themeVersion: 0.2.0-alpha.234
discord:
  enabled: false
`,
    );
    const bundleReview = parseCapabilityBundleReview(
      `bundleContract: capability-bundles-v1
pilot:
  sourceBundles: [core]
  targetBundles: [core, media, web, chat]
cohorts:
  sites:
    sourceBundles: [core, site, publishing]
    targetBundles: [core, media, automation, web, chat, site, publishing, federation]
`,
    );

    await stageLegacyCrossover(source, output, {
      bundleReview,
      sitePins: {
        docs: {
          package: "@rizom/site-docs",
          version: "0.2.0-alpha.237",
          theme: "@rizom/theme-rizom-ai",
          themeVersion: "0.2.0-alpha.234",
        },
      },
    });

    expect(await readFile(join(output, "pilot.yaml"), "utf8")).toContain(
      "bundleContract: capability-bundles-v1",
    );
    expect(await readFile(join(output, "pilot.yaml"), "utf8")).toContain(
      "bundles:\n  - core\n  - media\n  - web\n  - chat",
    );
    expect(
      await readFile(join(output, "cohorts", "sites.yaml"), "utf8"),
    ).toContain("  - federation");
    expect(
      await readFile(join(output, "users", "alice", "brain.yaml"), "utf8"),
    ).toContain("bundleContract: capability-bundles-v1");
    expect(
      await readFile(join(output, "users", "docs", "brain.yaml"), "utf8"),
    ).toContain("  - federation");
  });

  test("requires a complete identity-matched hosted site pin manifest", async () => {
    const root = await createTempDir("ops-crossover-pins-");
    const source = join(root, "source");
    await mkdir(join(source, "cohorts"), { recursive: true });
    await mkdir(join(source, "users"), { recursive: true });
    await writeFile(
      join(source, "pilot.yaml"),
      `schemaVersion: 1
brainVersion: 0.2.0-alpha.231
model: rover
githubOrg: rizom-ai
contentRepoPrefix: rover-
domainSuffix: .rizom.ai
preset: core
aiApiKey: PILOT_AI_API_KEY
gitSyncToken: PILOT_GIT_SYNC_TOKEN
contentRepoAdminToken: CONTENT_REPO_ADMIN_TOKEN
agePublicKey: age1pilotpublickey
`,
    );
    await writeFile(
      join(source, "cohorts", "sites.yaml"),
      "members:\n  - alice\n",
    );
    await writeFile(
      join(source, "users", "alice.yaml"),
      `handle: alice
siteOverride:
  package: "@rizom/site-alice"
  theme: "@rizom/theme-alice"
  themeVersion: 0.2.0-alpha.230
discord:
  enabled: false
`,
    );

    expect(
      stageLegacyCrossover(source, join(root, "missing-pins")),
    ).rejects.toThrow("no reviewed site pin");
    expect(
      stageLegacyCrossover(source, join(root, "wrong-identity"), {
        sitePins: {
          alice: {
            package: "@rizom/site-other",
            version: "0.2.0-alpha.231",
            theme: "@rizom/theme-alice",
            themeVersion: "0.2.0-alpha.230",
          },
        },
      }),
    ).rejects.toThrow("identity does not match");
    expect(
      stageLegacyCrossover(source, join(root, "conflicting-pin"), {
        sitePins: {
          alice: {
            package: "@rizom/site-alice",
            version: "0.2.0-alpha.231",
            theme: "@rizom/theme-alice",
            themeVersion: "0.2.0-alpha.229",
          },
        },
      }),
    ).rejects.toThrow("theme version does not match");
    expect(
      stageLegacyCrossover(source, join(root, "extra-pin"), {
        sitePins: {
          alice: {
            package: "@rizom/site-alice",
            version: "0.2.0-alpha.231",
            theme: "@rizom/theme-alice",
            themeVersion: "0.2.0-alpha.230",
          },
          bob: {
            package: "@rizom/site-bob",
            version: "0.2.0-alpha.231",
          },
        },
      }),
    ).rejects.toThrow("do not match site users: bob");
  });

  test("refuses to write inside the source repository", async () => {
    const source = await createTempDir("ops-crossover-source-");
    let failure: unknown;
    try {
      await stageLegacyCrossover(source, join(source, "staged"));
    } catch (error) {
      failure = error;
    }

    expect(failure).toBeInstanceOf(Error);
    if (failure instanceof Error) {
      expect(failure.message).toContain("outside the source repository");
    }
  });
});
