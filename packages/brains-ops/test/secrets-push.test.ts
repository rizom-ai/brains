import { describe, expect, it } from "bun:test";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { pushPilotSecrets } from "../src/secrets-push";

async function createPilotRepo(files: Record<string, string>): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "brains-ops-secrets-push-"));

  for (const [relativePath, content] of Object.entries(files)) {
    const filePath = join(root, relativePath);
    await mkdir(dirname(filePath), { recursive: true });
    await writeFile(filePath, content);
  }

  return root;
}

describe("pushPilotSecrets", () => {
  it("pushes shared pilot secrets from local env files", async () => {
    const root = await createPilotRepo({
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
# @required @sensitive
KAMAL_SSH_PRIVATE_KEY=
# @required @sensitive
CERTIFICATE_PEM=
`,
    });

    const fakeHome = join(root, "home");
    await mkdir(join(fakeHome, ".ssh"), { recursive: true });
    await writeFile(
      join(fakeHome, ".ssh", "pilot_ed25519"),
      "-----BEGIN OPENSSH PRIVATE KEY-----\nline-one\n-----END OPENSSH PRIVATE KEY-----\n",
    );
    await writeFile(join(root, "origin.pem"), "cert-pem\n");
    await writeFile(
      join(root, ".env.local"),
      [
        "AI_API_KEY=shared-ai-key",
        "GIT_SYNC_TOKEN=git-token",
        "MCP_AUTH_TOKEN=mcp-token",
        "DISCORD_BOT_TOKEN=should-not-push",
        "HCLOUD_TOKEN=hcloud-token",
        "KAMAL_SSH_PRIVATE_KEY_FILE=~/.ssh/pilot_ed25519",
        "CERTIFICATE_PEM_FILE=./origin.pem",
        "",
      ].join("\n"),
    );

    const originalHome = process.env["HOME"];
    process.env["HOME"] = fakeHome;

    try {
      const calls: Array<{ command: string; args: string[]; stdin?: string }> =
        [];

      const result = await pushPilotSecrets(root, {
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
        "GIT_SYNC_TOKEN",
        "MCP_AUTH_TOKEN",
        "HCLOUD_TOKEN",
        "KAMAL_SSH_PRIVATE_KEY",
        "CERTIFICATE_PEM",
      ]);
      expect(result.skippedKeys).toEqual([]);
      expect(calls).toContainEqual({
        command: "gh",
        args: ["secret", "set", "GIT_SYNC_TOKEN"],
        stdin: "git-token",
      });
      expect(calls).toContainEqual({
        command: "gh",
        args: ["secret", "set", "MCP_AUTH_TOKEN"],
        stdin: "mcp-token",
      });
      expect(calls).toContainEqual({
        command: "gh",
        args: ["secret", "set", "KAMAL_SSH_PRIVATE_KEY"],
        stdin:
          "-----BEGIN OPENSSH PRIVATE KEY-----\nline-one\n-----END OPENSSH PRIVATE KEY-----\n",
      });
      expect(calls.some((call) => call.args[2] === "DISCORD_BOT_TOKEN")).toBe(
        false,
      );
    } finally {
      if (originalHome === undefined) {
        delete process.env["HOME"];
      } else {
        process.env["HOME"] = originalHome;
      }
    }
  });

  it("supports dry-run and reports missing required secrets", async () => {
    const root = await createPilotRepo({
      ".env.schema": `# @required @sensitive
AI_API_KEY=
# @required @sensitive
GIT_SYNC_TOKEN=
# @required @sensitive
MCP_AUTH_TOKEN=
# @required @sensitive
HCLOUD_TOKEN=
# @sensitive
DISCORD_BOT_TOKEN=
`,
      ".env.local": "AI_API_KEY=shared-ai-key\n",
    });

    const logs: string[] = [];
    const result = await pushPilotSecrets(root, {
      dryRun: true,
      logger: (message) => logs.push(message),
    });

    expect(result.dryRun).toBe(true);
    expect(result.pushedKeys).toEqual(["AI_API_KEY"]);
    expect(result.skippedKeys).toEqual([
      "GIT_SYNC_TOKEN",
      "MCP_AUTH_TOKEN",
      "HCLOUD_TOKEN",
    ]);
    expect(logs[0]).toContain("Dry run: would push 1 secrets");
    expect(logs[1]).toContain("Secrets: AI_API_KEY");
    expect(logs).toContain("Required before first deploy (3):");
    expect(logs).toContain("  - GIT_SYNC_TOKEN");
    expect(logs).toContain("  - MCP_AUTH_TOKEN");
    expect(logs).toContain("  - HCLOUD_TOKEN");
  });
});
