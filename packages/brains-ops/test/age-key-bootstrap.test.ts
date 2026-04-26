import { describe, expect, it } from "bun:test";
import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import {
  bootstrapPilotAgeKey,
  extractAgeIdentity,
} from "../src/age-key-bootstrap";

async function createPilotRepo(files: Record<string, string>): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "brains-ops-age-key-"));

  for (const [relativePath, content] of Object.entries(files)) {
    const filePath = join(root, relativePath);
    await mkdir(dirname(filePath), { recursive: true });
    await writeFile(filePath, content);
  }

  return root;
}

describe("bootstrapPilotAgeKey", () => {
  it("creates a local age identity, updates pilot.yaml, and can push to GitHub secrets", async () => {
    const root = await createPilotRepo({
      "pilot.yaml": `schemaVersion: 1
brainVersion: 0.2.0-alpha.1
model: rover
githubOrg: rizom-ai
contentRepoPrefix: rover-
domainSuffix: .rizom.ai
preset: core
aiApiKey: AI_API_KEY
gitSyncToken: GIT_SYNC_TOKEN
contentRepoAdminToken: CONTENT_REPO_ADMIN_TOKEN
mcpAuthToken: MCP_AUTH_TOKEN
agePublicKey: age1replace-with-your-public-key
`,
    });

    const calls: Array<{ command: string; args: string[]; stdin?: string }> =
      [];
    const result = await bootstrapPilotAgeKey(root, {
      pushTo: "gh",
      logger: () => {},
      runCommand: async (command, args, options) => {
        calls.push({
          command,
          args,
          ...(options?.stdin !== undefined ? { stdin: options.stdin } : {}),
        });
      },
    });

    expect(result.createdLocalKey).toBe(true);
    expect(existsSync(result.identityPath)).toBe(true);
    expect(result.agePublicKey.startsWith("age1")).toBe(true);

    const pilotYaml = await readFile(join(root, "pilot.yaml"), "utf8");
    expect(pilotYaml).toContain(`agePublicKey: ${result.agePublicKey}`);

    const identityFile = await readFile(result.identityPath, "utf8");
    expect(extractAgeIdentity(identityFile).startsWith("AGE-SECRET-KEY-")).toBe(
      true,
    );
    expect(calls).toEqual([
      {
        command: "gh",
        args: ["secret", "set", "AGE_SECRET_KEY"],
        stdin: identityFile,
      },
    ]);
  });

  it("reuses an existing local age identity", async () => {
    const root = await createPilotRepo({
      "pilot.yaml": `schemaVersion: 1
brainVersion: 0.2.0-alpha.1
model: rover
githubOrg: rizom-ai
contentRepoPrefix: rover-
domainSuffix: .rizom.ai
preset: core
aiApiKey: AI_API_KEY
gitSyncToken: GIT_SYNC_TOKEN
contentRepoAdminToken: CONTENT_REPO_ADMIN_TOKEN
mcpAuthToken: MCP_AUTH_TOKEN
agePublicKey: age1replace-with-your-public-key
`,
    });

    const first = await bootstrapPilotAgeKey(root, { logger: () => {} });
    const second = await bootstrapPilotAgeKey(root, { logger: () => {} });

    expect(second.createdLocalKey).toBe(false);
    expect(second.identityPath).toBe(first.identityPath);
    expect(second.agePublicKey).toBe(first.agePublicKey);
  });

  it("fails when pilot.yaml already points at a different non-placeholder agePublicKey", async () => {
    const root = await createPilotRepo({
      "pilot.yaml": `schemaVersion: 1
brainVersion: 0.2.0-alpha.1
model: rover
githubOrg: rizom-ai
contentRepoPrefix: rover-
domainSuffix: .rizom.ai
preset: core
aiApiKey: AI_API_KEY
gitSyncToken: GIT_SYNC_TOKEN
contentRepoAdminToken: CONTENT_REPO_ADMIN_TOKEN
mcpAuthToken: MCP_AUTH_TOKEN
agePublicKey: age1differentexistingkey
`,
    });

    try {
      await bootstrapPilotAgeKey(root, { logger: () => {} });
      expect.unreachable("expected bootstrapPilotAgeKey to fail");
    } catch (error) {
      expect(String(error)).toContain(
        "pilot.yaml agePublicKey does not match local age identity",
      );
    }
  });
});
