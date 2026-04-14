import { describe, expect, it } from "bun:test";
import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import {
  Decrypter,
  armor,
  generateIdentity,
  identityToRecipient,
} from "age-encryption";

import { encryptPilotSecrets } from "../src/secrets-encrypt";

async function createPilotRepo(files: Record<string, string>): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "brains-ops-secrets-"));

  for (const [relativePath, content] of Object.entries(files)) {
    const filePath = join(root, relativePath);
    await mkdir(dirname(filePath), { recursive: true });
    await writeFile(filePath, content);
  }

  return root;
}

async function decryptYamlFile(
  path: string,
  identity: string,
): Promise<string> {
  const armored = await readFile(path, "utf8");
  const decoded = armor.decode(armored);
  const decrypter = new Decrypter();
  decrypter.addIdentity(identity);
  return decrypter.decrypt(decoded, "text");
}

describe("encryptPilotSecrets", () => {
  it("encrypts discord token and override-only secrets to an .age file", async () => {
    const identity = await generateIdentity();
    const agePublicKey = await identityToRecipient(identity);

    const root = await createPilotRepo({
      "pilot.yaml": `schemaVersion: 1
brainVersion: 0.2.0-alpha.1
model: rover
githubOrg: rizom-ai
contentRepoPrefix: rover-
domainSuffix: .rizom.ai
preset: core
aiApiKey: SHARED_AI_KEY
gitSyncToken: SHARED_GIT_SYNC_TOKEN
mcpAuthToken: SHARED_MCP_AUTH_TOKEN
agePublicKey: ${agePublicKey}
`,
      "users/alice.yaml": `handle: alice
discord:
  enabled: true
aiApiKeyOverride: ALICE_AI_KEY
`,
      "cohorts/canary.yaml": `gitSyncTokenOverride: CANARY_GIT_SYNC_TOKEN
members:
  - alice
`,
      ".env.local": [
        "ALICE_AI_KEY=alice-ai-key",
        "CANARY_GIT_SYNC_TOKEN=git-token",
        "DISCORD_BOT_TOKEN=discord-token",
        "SHARED_MCP_AUTH_TOKEN=shared-mcp-token",
        "",
      ].join("\n"),
      "users/alice.secrets.yaml": "discordBotToken: stale\n",
    });

    const result = await encryptPilotSecrets(root, "alice");

    expect([...result.encryptedKeys].sort()).toEqual([
      "aiApiKey",
      "discordBotToken",
      "gitSyncToken",
    ]);
    expect(result.deletedPlaintext).toBe(true);

    const decrypted = await decryptYamlFile(
      join(root, "users/alice.secrets.yaml.age"),
      identity,
    );
    expect(decrypted).toContain("aiApiKey: alice-ai-key");
    expect(decrypted).toContain("gitSyncToken: git-token");
    expect(decrypted).toContain("discordBotToken: discord-token");
    expect(decrypted).not.toContain("mcpAuthToken:");
  });

  it("supports dry-run without writing files", async () => {
    const identity = await generateIdentity();
    const agePublicKey = await identityToRecipient(identity);

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
mcpAuthToken: MCP_AUTH_TOKEN
agePublicKey: ${agePublicKey}
`,
      "users/alice.yaml": `handle: alice
discord:
  enabled: false
`,
      "cohorts/canary.yaml": `members:
  - alice
`,
      ".env.local": "AI_API_KEY=shared-ai\n",
    });

    const logs: string[] = [];
    const result = await encryptPilotSecrets(root, "alice", {
      dryRun: true,
      logger: (message) => logs.push(message),
    });

    expect(result.dryRun).toBe(true);
    expect(result.encryptedKeys).toEqual([]);
    expect(logs[0]).toContain("would encrypt 0 secrets");
    expect(logs[1]).toContain("shared defaults only");
  });

  it("errors when discord is enabled but no local discord token is available", async () => {
    const identity = await generateIdentity();
    const agePublicKey = await identityToRecipient(identity);

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
mcpAuthToken: MCP_AUTH_TOKEN
agePublicKey: ${agePublicKey}
`,
      "users/alice.yaml": `handle: alice
discord:
  enabled: true
`,
      "cohorts/canary.yaml": `members:
  - alice
`,
      ".env.local": "AI_API_KEY=shared-ai\n",
    });

    try {
      await encryptPilotSecrets(root, "alice");
      expect.unreachable("expected encryptPilotSecrets to fail");
    } catch (error) {
      expect(String(error)).toContain(
        "Missing required local secret value for DISCORD_BOT_TOKEN",
      );
    }
  });
});
