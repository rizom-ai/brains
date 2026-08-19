import { createTempDir } from "@brains/test-utils";
import { describe, expect, it } from "bun:test";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { getErrorMessage } from "@brains/utils/error";

import {
  loadPilotRegistry,
  type ObservedUserStatus,
} from "../src/load-registry";
import { userSchema } from "../src/schema";

async function createPilotRepo(files: Record<string, string>): Promise<string> {
  const root = await createTempDir("rover-pilot-");

  for (const [relativePath, content] of Object.entries(files)) {
    const filePath = join(root, relativePath);
    await mkdir(dirname(filePath), { recursive: true });
    await writeFile(filePath, content);
  }

  return root;
}

describe("loadPilotRegistry", () => {
  it("loads pilot config and derives effective values per user", async () => {
    const root = await createPilotRepo({
      "pilot.yaml": `brainVersion: 0.1.1-alpha.14
bundleContract: capability-bundles-v1
githubOrg: rizom-ai
contentRepoPrefix: rover-
domainSuffix: .rizom.ai
bundles:
  - core
aiApiKey: AI_API_KEY
gitSyncToken: GIT_SYNC_TOKEN
contentRepoAdminToken: CONTENT_REPO_ADMIN_TOKEN
agePublicKey: age1testpublickey
`,
      "users/alice.yaml": `handle: alice
anchorProfile:
  name: Alice Example
  description: Researcher and writer

discord:
  enabled: false
`,
      "users/bob.yaml": `handle: bob
discord:
  enabled: true
  anchorUserId: "123456789"
aiApiKeyOverride: BOB_AI_API_KEY
gitSyncTokenOverride: BOB_GIT_SYNC_TOKEN
`,
      "cohorts/canary.yaml": `brainVersionOverride: 0.1.1-alpha.15
bundlesOverride:
  - core
  - site
  - publishing
aiApiKeyOverride: CANARY_AI_API_KEY
members:
  - alice
`,
      "cohorts/steady.yaml": `members:
  - bob
`,
      "users/alice/brain.yaml":
        "brain: brain\nbundles:\n  - core\n  - site\n  - publishing\n",
    });

    const registry = await loadPilotRegistry(root);

    expect(registry.pilot.bundles).toEqual(["core"]);
    expect(registry.users).toHaveLength(2);
    expect(registry.users).toEqual([
      {
        anchorProfile: {
          description: "Researcher and writer",
          name: "Alice Example",
        },
        brainVersion: "0.1.1-alpha.15",
        bundleContract: "capability-bundles-v1",
        bundles: ["core", "site", "publishing"],
        add: [],
        remove: [],
        cohort: "canary",
        contentRepo: "rover-alice-content",
        deployStatus: "unknown",
        discordEnabled: false,
        dnsStatus: "unknown",
        domain: "alice.rizom.ai",
        effectiveAiApiKey: "CANARY_AI_API_KEY",
        effectiveGitSyncToken: "GIT_SYNC_TOKEN",
        handle: "alice",
        mcpStatus: "unknown",
        serverStatus: "unknown",
        snapshotStatus: "present",
      },
      {
        anchorProfile: {
          name: "Bob",
        },
        brainVersion: "0.1.1-alpha.14",
        bundleContract: "capability-bundles-v1",
        bundles: ["core"],
        add: [],
        remove: [],
        cohort: "steady",
        contentRepo: "rover-bob-content",
        deployStatus: "unknown",
        discordEnabled: true,
        discordAnchorUserId: "123456789",
        dnsStatus: "unknown",
        domain: "bob.rizom.ai",
        effectiveAiApiKey: "BOB_AI_API_KEY",
        effectiveGitSyncToken: "BOB_GIT_SYNC_TOKEN",
        handle: "bob",
        mcpStatus: "unknown",
        serverStatus: "unknown",
        snapshotStatus: "missing",
      },
    ]);
  });

  it("loads user-level setup email delivery metadata", async () => {
    const root = await createPilotRepo({
      "pilot.yaml": `brainVersion: 0.1.1-alpha.14
bundleContract: capability-bundles-v1
githubOrg: rizom-ai
contentRepoPrefix: rover-
domainSuffix: .rizom.ai
bundles:
  - core
  - site
  - publishing
aiApiKey: AI_API_KEY
gitSyncToken: GIT_SYNC_TOKEN
contentRepoAdminToken: CONTENT_REPO_ADMIN_TOKEN
agePublicKey: age1testpublickey
`,
      "users/alice.yaml": `handle: alice
setup:
  delivery: email
  email: alice@example.com
discord:
  enabled: false
`,
      "cohorts/canary.yaml": `members:
  - alice
`,
    });

    const registry = await loadPilotRegistry(root);

    expect(registry.users[0]?.setup).toEqual({
      delivery: "email",
      email: "alice@example.com",
    });
  });

  it("loads user-level site and deployment override metadata", async () => {
    const root = await createPilotRepo({
      "pilot.yaml": `brainVersion: 0.2.0-alpha.136
bundleContract: capability-bundles-v1
githubOrg: rizom-ai
contentRepoPrefix: rover-
domainSuffix: .rizom.ai
bundles:
  - core
  - site
  - publishing
aiApiKey: AI_API_KEY
gitSyncToken: GIT_SYNC_TOKEN
contentRepoAdminToken: CONTENT_REPO_ADMIN_TOKEN
agePublicKey: age1testpublickey
`,
      "users/rizom-work.yaml": `handle: rizom-work
domainOverride: rizom.work
cloudflareZoneId: rizom-work-zone
contentRepoOverride: rizom-ai/rizom-work-content
profileKind: organization
addOverride:
  - docs
siteOverride:
  package: "@rizom/site-rizom-work"
  version: 0.2.0-alpha.136
  theme: "@brains/theme-rizom"
discord:
  enabled: false
`,
      "cohorts/sites.yaml": `members:
  - rizom-work
`,
    });

    const registry = await loadPilotRegistry(root);

    expect(registry.users[0]?.domain).toBe("rizom.work");
    expect(registry.users[0]?.cloudflareZoneId).toBe("rizom-work-zone");
    expect(registry.users[0]?.contentRepo).toBe("rizom-ai/rizom-work-content");
    expect(registry.users[0]?.profileKind).toBe("organization");
    expect(registry.users[0]?.add).toEqual(["docs"]);
    expect(registry.users[0]?.siteOverride).toEqual({
      package: "@rizom/site-rizom-work",
      version: "0.2.0-alpha.136",
      theme: "@brains/theme-rizom",
    });
  });

  it("requires exact site and external theme package pins", () => {
    const baseUser = {
      handle: "site-user",
      discord: { enabled: false },
    };

    expect(
      userSchema.safeParse({
        ...baseUser,
        siteOverride: { package: "@rizom/site-user" },
      }).success,
    ).toBe(false);
    expect(
      userSchema.safeParse({
        ...baseUser,
        siteOverride: {
          package: "@rizom/site-user",
          version: "0.2.0-alpha.136",
          theme: "@rizom/theme-user",
        },
      }).success,
    ).toBe(false);
    expect(
      userSchema.safeParse({
        ...baseUser,
        siteOverride: {
          package: "@rizom/site-user",
          version: "0.2.0-alpha.136",
          theme: "@brains/theme-rizom",
          themeVersion: "0.2.0-alpha.136",
        },
      }).success,
    ).toBe(false);
    expect(
      userSchema.safeParse({
        ...baseUser,
        siteOverride: {
          package: "@rizom/site-user",
          version: "0.2.0-alpha.136",
          theme: "@rizom/theme-user",
          themeVersion: "0.2.0-alpha.135",
        },
      }).success,
    ).toBe(true);
  });

  it("loads user-level ATProto identifier metadata", async () => {
    const root = await createPilotRepo({
      "pilot.yaml": `brainVersion: 0.1.1-alpha.14
bundleContract: capability-bundles-v1
githubOrg: rizom-ai
contentRepoPrefix: rover-
domainSuffix: .rizom.ai
bundles:
  - core
  - site
  - publishing
aiApiKey: AI_API_KEY
gitSyncToken: GIT_SYNC_TOKEN
contentRepoAdminToken: CONTENT_REPO_ADMIN_TOKEN
agePublicKey: age1testpublickey
`,
      "users/smoke.yaml": `handle: smoke
atproto:
  identifier: rizom-test.bsky.social
  lexiconAuthority: true
  jetstream:
    enabled: true
    queueLimit: 64
    concurrency: 2
discord:
  enabled: false
`,
      "cohorts/smoke.yaml": `members:
  - smoke
`,
    });

    const registry = await loadPilotRegistry(root);

    expect(registry.users[0]?.atproto).toEqual({
      identifier: "rizom-test.bsky.social",
      lexiconAuthority: true,
      jetstream: {
        enabled: true,
        queueLimit: 64,
        concurrency: 2,
      },
    });
  });

  it("fails when user belongs to no cohort", async () => {
    const root = await createPilotRepo({
      "pilot.yaml": `brainVersion: 0.1.1-alpha.14
bundleContract: capability-bundles-v1
githubOrg: rizom-ai
contentRepoPrefix: rover-
domainSuffix: .rizom.ai
bundles:
  - core
aiApiKey: AI_API_KEY
gitSyncToken: GIT_SYNC_TOKEN
contentRepoAdminToken: CONTENT_REPO_ADMIN_TOKEN
agePublicKey: age1testpublickey
`,
      "users/alice.yaml": `handle: alice
discord:
  enabled: false
`,
      "users/bob.yaml": `handle: bob
discord:
  enabled: false
`,
      "cohorts/canary.yaml": `members:
  - bob
`,
    });

    try {
      await loadPilotRegistry(root);
      expect.unreachable("expected loadPilotRegistry to fail");
    } catch (error) {
      expect(getErrorMessage(error)).toContain(
        "User alice must belong to exactly one cohort",
      );
    }
  });

  it("fails when user belongs to multiple cohorts", async () => {
    const root = await createPilotRepo({
      "pilot.yaml": `brainVersion: 0.1.1-alpha.14
bundleContract: capability-bundles-v1
githubOrg: rizom-ai
contentRepoPrefix: rover-
domainSuffix: .rizom.ai
bundles:
  - core
aiApiKey: AI_API_KEY
gitSyncToken: GIT_SYNC_TOKEN
contentRepoAdminToken: CONTENT_REPO_ADMIN_TOKEN
agePublicKey: age1testpublickey
`,
      "users/alice.yaml": `handle: alice
discord:
  enabled: false
`,
      "cohorts/canary.yaml": `members:
  - alice
`,
      "cohorts/steady.yaml": `members:
  - alice
`,
    });

    try {
      await loadPilotRegistry(root);
      expect.unreachable("expected loadPilotRegistry to fail");
    } catch (error) {
      expect(getErrorMessage(error)).toContain(
        "User alice must belong to exactly one cohort",
      );
    }
  });

  it("merges observed status from resolver", async () => {
    const root = await createPilotRepo({
      "pilot.yaml": `brainVersion: 0.1.1-alpha.14
bundleContract: capability-bundles-v1
githubOrg: rizom-ai
contentRepoPrefix: rover-
domainSuffix: .rizom.ai
bundles:
  - core
aiApiKey: AI_API_KEY
gitSyncToken: GIT_SYNC_TOKEN
contentRepoAdminToken: CONTENT_REPO_ADMIN_TOKEN
agePublicKey: age1testpublickey
`,
      "users/alice.yaml": `handle: alice
discord:
  enabled: false
`,
      "cohorts/canary.yaml": `members:
  - alice
`,
    });

    const statusByHandle: Record<string, ObservedUserStatus> = {
      alice: {
        serverStatus: "ready",
        deployStatus: "ready",
        dnsStatus: "ready",
        mcpStatus: "failed",
      },
    };

    const registry = await loadPilotRegistry(root, {
      resolveStatus(user) {
        return Promise.resolve(statusByHandle[user.handle]);
      },
    });

    expect(registry.users[0]).toMatchObject({
      serverStatus: "ready",
      deployStatus: "ready",
      dnsStatus: "ready",
      mcpStatus: "failed",
    });
  });

  it("fails when user file name and handle disagree", async () => {
    const root = await createPilotRepo({
      "pilot.yaml": `brainVersion: 0.1.1-alpha.14
bundleContract: capability-bundles-v1
githubOrg: rizom-ai
contentRepoPrefix: rover-
domainSuffix: .rizom.ai
bundles:
  - core
aiApiKey: AI_API_KEY
gitSyncToken: GIT_SYNC_TOKEN
contentRepoAdminToken: CONTENT_REPO_ADMIN_TOKEN
agePublicKey: age1testpublickey
`,
      "users/alice.yaml": `handle: bob
discord:
  enabled: false
`,
      "cohorts/canary.yaml": `members:
  - bob
`,
    });

    try {
      await loadPilotRegistry(root);
      expect.unreachable("expected loadPilotRegistry to fail");
    } catch (error) {
      expect(getErrorMessage(error)).toContain(
        "users/alice.yaml must declare handle: alice",
      );
    }
  });
});

describe("profile kind validation", () => {
  it("rejects profile kinds no runtime registers at parse time", () => {
    const result = userSchema.safeParse({
      handle: "rizom-ai",
      discord: { enabled: false },
      profileKind: "collective",
    });
    expect(result.success).toBeFalse();
    if (!result.success) {
      expect(JSON.stringify(result.error.issues)).toContain("profileKind");
    }
  });

  it("accepts every runtime-registered profile kind", () => {
    for (const kind of ["professional", "team", "organization"]) {
      expect(
        userSchema.safeParse({
          handle: "rizom-ai",
          discord: { enabled: false },
          profileKind: kind,
        }).success,
      ).toBeTrue();
    }
  });

  it("stays in lockstep with the runtime's built-in profile kinds", async () => {
    const { BUILT_IN_PROFILE_KINDS } = await import("@brains/profile");
    const { PROFILE_KINDS } = await import("../src/schema");
    expect([...PROFILE_KINDS].map(String).sort()).toEqual(
      BUILT_IN_PROFILE_KINDS.map(
        (definition: { kind: string }) => definition.kind,
      ).sort(),
    );
  });
});
