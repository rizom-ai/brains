import { describe, expect, it } from "bun:test";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import {
  loadPilotRegistry,
  type ObservedUserStatus,
} from "../src/load-registry";

async function createPilotRepo(files: Record<string, string>): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "rover-pilot-"));

  for (const [relativePath, content] of Object.entries(files)) {
    const filePath = join(root, relativePath);
    await mkdir(dirname(filePath), { recursive: true });
    await writeFile(filePath, content);
  }

  return root;
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

describe("loadPilotRegistry", () => {
  it("loads pilot config and derives effective values per user", async () => {
    const root = await createPilotRepo({
      "pilot.yaml": `schemaVersion: 1
brainVersion: 0.1.1-alpha.14
model: rover
githubOrg: rizom-ai
contentRepoPrefix: rover-
domainSuffix: .rizom.ai
preset: core
aiApiKey: AI_API_KEY
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
`,
      "cohorts/canary.yaml": `brainVersionOverride: 0.1.1-alpha.15
presetOverride: default
aiApiKeyOverride: CANARY_AI_API_KEY
members:
  - alice
`,
      "cohorts/steady.yaml": `members:
  - bob
`,
      "users/alice/brain.yaml": "brain: rover\npreset: default\n",
    });

    const registry = await loadPilotRegistry(root);

    expect(registry.pilot.model).toBe("rover");
    expect(registry.users).toHaveLength(2);
    expect(registry.users).toEqual([
      {
        anchorProfile: {
          description: "Researcher and writer",
          name: "Alice Example",
        },
        brainVersion: "0.1.1-alpha.15",
        cohort: "canary",
        contentRepo: "rover-alice-content",
        deployStatus: "unknown",
        discordEnabled: false,
        dnsStatus: "unknown",
        domain: "alice.rizom.ai",
        effectiveAiApiKey: "CANARY_AI_API_KEY",
        handle: "alice",
        mcpStatus: "unknown",
        model: "rover",
        preset: "default",
        serverStatus: "unknown",
        snapshotStatus: "present",
      },
      {
        anchorProfile: {
          name: "Bob",
        },
        brainVersion: "0.1.1-alpha.14",
        cohort: "steady",
        contentRepo: "rover-bob-content",
        deployStatus: "unknown",
        discordEnabled: true,
        discordAnchorUserId: "123456789",
        dnsStatus: "unknown",
        domain: "bob.rizom.ai",
        effectiveAiApiKey: "BOB_AI_API_KEY",
        handle: "bob",
        mcpStatus: "unknown",
        model: "rover",
        preset: "core",
        serverStatus: "unknown",
        snapshotStatus: "missing",
      },
    ]);
  });

  it("fails when user belongs to no cohort", async () => {
    const root = await createPilotRepo({
      "pilot.yaml": `schemaVersion: 1
brainVersion: 0.1.1-alpha.14
model: rover
githubOrg: rizom-ai
contentRepoPrefix: rover-
domainSuffix: .rizom.ai
preset: core
aiApiKey: AI_API_KEY
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
      "pilot.yaml": `schemaVersion: 1
brainVersion: 0.1.1-alpha.14
model: rover
githubOrg: rizom-ai
contentRepoPrefix: rover-
domainSuffix: .rizom.ai
preset: core
aiApiKey: AI_API_KEY
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
      "pilot.yaml": `schemaVersion: 1
brainVersion: 0.1.1-alpha.14
model: rover
githubOrg: rizom-ai
contentRepoPrefix: rover-
domainSuffix: .rizom.ai
preset: core
aiApiKey: AI_API_KEY
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
      "pilot.yaml": `schemaVersion: 1
brainVersion: 0.1.1-alpha.14
model: rover
githubOrg: rizom-ai
contentRepoPrefix: rover-
domainSuffix: .rizom.ai
preset: core
aiApiKey: AI_API_KEY
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
