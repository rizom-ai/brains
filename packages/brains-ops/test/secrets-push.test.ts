import { describe, expect, it } from "bun:test";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { pushPilotSecrets } from "../src/secrets-push";

async function createPilotRepo(files: Record<string, string>) {
  const root = await mkdtemp(join(tmpdir(), "brains-ops-secrets-"));

  for (const [relativePath, content] of Object.entries(files)) {
    const filePath = join(root, relativePath);
    await mkdir(dirname(filePath), { recursive: true });
    await writeFile(filePath, content);
  }

  return root;
}

describe("pushPilotSecrets", () => {
  it("pushes shared and namespaced per-user secrets from local env files", async () => {
    const root = await createPilotRepo({
      "pilot.yaml": `schemaVersion: 1
brainVersion: 0.2.0-alpha.1
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
      ".env.schema": `# @required @sensitive
AI_API_KEY=
# @required @sensitive
GIT_SYNC_TOKEN=
# @required @sensitive
MCP_AUTH_TOKEN=
# @sensitive
DISCORD_BOT_TOKEN=
# @required @sensitive
HCLOUD_TOKEN=
# @required
HCLOUD_SSH_KEY_NAME=
# @required
HCLOUD_SERVER_TYPE=
# @required
HCLOUD_LOCATION=
# @required @sensitive
KAMAL_SSH_PRIVATE_KEY=
# @required @sensitive
KAMAL_REGISTRY_PASSWORD=
# @required @sensitive
CF_API_TOKEN=
# @required
CF_ZONE_ID=
# @required @sensitive
CERTIFICATE_PEM=
# @required @sensitive
PRIVATE_KEY_PEM=
`,
    });

    const fakeHome = join(root, "home");
    await mkdir(join(fakeHome, ".ssh"), { recursive: true });
    await writeFile(
      join(fakeHome, ".ssh", "pilot_ed25519"),
      "-----BEGIN OPENSSH PRIVATE KEY-----\nline-one\n-----END OPENSSH PRIVATE KEY-----\n",
    );
    await writeFile(join(root, "origin.pem"), "cert-pem\n");
    await writeFile(join(root, "origin.key"), "key-pem\n");
    await writeFile(
      join(root, ".env.local"),
      [
        "AI_API_KEY=shared-ai-key",
        "GIT_SYNC_TOKEN=git-token",
        "MCP_AUTH_TOKEN=mcp-token",
        "HCLOUD_TOKEN=hcloud-token",
        "HCLOUD_SSH_KEY_NAME=pilot-key",
        "HCLOUD_SERVER_TYPE=cx22",
        "HCLOUD_LOCATION=fsn1",
        "KAMAL_SSH_PRIVATE_KEY_FILE=~/.ssh/pilot_ed25519",
        "KAMAL_REGISTRY_PASSWORD=registry-password",
        "CF_API_TOKEN=cf-token",
        "CF_ZONE_ID=zone-id",
        "CERTIFICATE_PEM_FILE=./origin.pem",
        "PRIVATE_KEY_PEM_FILE=./origin.key",
        "",
      ].join("\n"),
    );

    const originalHome = process.env["HOME"];
    process.env["HOME"] = fakeHome;

    try {
      const calls: Array<{
        command: string;
        args: string[];
        stdin?: string;
      }> = [];

      const result = await pushPilotSecrets(root, "alice", {
        runCommand: async (command, args, options) => {
          calls.push({
            command,
            args,
            ...(options?.stdin !== undefined ? { stdin: options.stdin } : {}),
          });
        },
      });

      expect(result.pushedKeys).toEqual([
        "AI_API_KEY",
        "GIT_SYNC_TOKEN_ALICE",
        "MCP_AUTH_TOKEN_ALICE",
        "HCLOUD_TOKEN",
        "HCLOUD_SSH_KEY_NAME",
        "HCLOUD_SERVER_TYPE",
        "HCLOUD_LOCATION",
        "KAMAL_SSH_PRIVATE_KEY",
        "KAMAL_REGISTRY_PASSWORD",
        "CF_API_TOKEN",
        "CF_ZONE_ID",
        "CERTIFICATE_PEM",
        "PRIVATE_KEY_PEM",
      ]);
      expect(result.skippedKeys).toEqual([]);
      expect(calls).toContainEqual({
        command: "gh",
        args: ["secret", "set", "GIT_SYNC_TOKEN_ALICE"],
        stdin: "git-token",
      });
      expect(calls).toContainEqual({
        command: "gh",
        args: ["secret", "set", "MCP_AUTH_TOKEN_ALICE"],
        stdin: "mcp-token",
      });
      expect(calls).toContainEqual({
        command: "gh",
        args: ["secret", "set", "KAMAL_SSH_PRIVATE_KEY"],
        stdin:
          "-----BEGIN OPENSSH PRIVATE KEY-----\nline-one\n-----END OPENSSH PRIVATE KEY-----\n",
      });
      expect(calls).toContainEqual({
        command: "gh",
        args: ["secret", "set", "CERTIFICATE_PEM"],
        stdin: "cert-pem\n",
      });
    } finally {
      if (originalHome === undefined) {
        delete process.env["HOME"];
      } else {
        process.env["HOME"] = originalHome;
      }
    }
  });

  it("uses the effective AI key secret name and skips discord when disabled", async () => {
    const root = await createPilotRepo({
      "pilot.yaml": `schemaVersion: 1
brainVersion: 0.2.0-alpha.1
model: rover
githubOrg: rizom-ai
contentRepoPrefix: rover-
domainSuffix: .rizom.ai
preset: core
aiApiKey: SHARED_AI_KEY
`,
      "users/alice.yaml": `handle: alice
discord:
  enabled: false
aiApiKeyOverride: ALICE_AI_KEY
`,
      "cohorts/canary.yaml": `members:
  - alice
`,
      ".env.schema": `# @required @sensitive
AI_API_KEY=
# @required @sensitive
GIT_SYNC_TOKEN=
# @required @sensitive
MCP_AUTH_TOKEN=
# @sensitive
DISCORD_BOT_TOKEN=
`,
      ".env.local":
        "AI_API_KEY=shared-fallback\nGIT_SYNC_TOKEN=git-token\nMCP_AUTH_TOKEN=mcp-token\n",
    });

    const calls: Array<{ command: string; args: string[]; stdin?: string }> =
      [];

    const result = await pushPilotSecrets(root, "alice", {
      runCommand: async (command, args, options) => {
        calls.push({
          command,
          args,
          ...(options?.stdin !== undefined ? { stdin: options.stdin } : {}),
        });
      },
    });

    expect(result.pushedKeys).toEqual([
      "ALICE_AI_KEY",
      "GIT_SYNC_TOKEN_ALICE",
      "MCP_AUTH_TOKEN_ALICE",
    ]);
    expect(result.skippedKeys).toEqual([]);
    expect(calls).toContainEqual({
      command: "gh",
      args: ["secret", "set", "ALICE_AI_KEY"],
      stdin: "shared-fallback",
    });
    expect(
      calls.some((call) => call.args[2] === "DISCORD_BOT_TOKEN_ALICE"),
    ).toBe(false);
  });

  it("supports dry-run and reports missing required secrets", async () => {
    const root = await createPilotRepo({
      "pilot.yaml": `schemaVersion: 1
brainVersion: 0.2.0-alpha.1
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
      ".env.schema": `# @required @sensitive
AI_API_KEY=
# @required @sensitive
GIT_SYNC_TOKEN=
# @required @sensitive
MCP_AUTH_TOKEN=
# @required @sensitive
HCLOUD_TOKEN=
`,
      ".env.local": "AI_API_KEY=shared-ai-key\n",
    });

    const logs: string[] = [];
    const calls: Array<{ command: string; args: string[] }> = [];

    const result = await pushPilotSecrets(root, "alice", {
      dryRun: true,
      logger: (message) => logs.push(message),
      runCommand: async (command, args) => {
        calls.push({ command, args });
      },
    });

    expect(result.dryRun).toBe(true);
    expect(result.pushedKeys).toEqual(["AI_API_KEY"]);
    expect(result.skippedKeys).toEqual([
      "GIT_SYNC_TOKEN_ALICE",
      "MCP_AUTH_TOKEN_ALICE",
      "HCLOUD_TOKEN",
    ]);
    expect(calls).toHaveLength(0);
    expect(logs[0]).toContain("Dry run: would push 1 secrets");
    expect(logs[1]).toContain("Secrets: AI_API_KEY");
    expect(logs).toContain("Required before first deploy (3):");
    expect(logs).toContain("  - GIT_SYNC_TOKEN_ALICE");
    expect(logs).toContain("  - MCP_AUTH_TOKEN_ALICE");
    expect(logs).toContain("  - HCLOUD_TOKEN");
  });
});
