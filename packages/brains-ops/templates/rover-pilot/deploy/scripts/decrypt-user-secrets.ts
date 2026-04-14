import { readFileSync } from "node:fs";

import { Decrypter, armor } from "age-encryption";

import { requireEnv, writeGitHubEnv, writeGitHubOutput } from "./helpers";

const handle = process.argv[2] ?? requireEnv("HANDLE");
const ageSecretKey = extractAgeIdentity(requireEnv("AGE_SECRET_KEY"));
const encryptedPath = `users/${handle}.secrets.yaml.age`;

const armored = readFileSync(encryptedPath, "utf8");
const decoded = armor.decode(armored);

const decrypter = new Decrypter();
decrypter.addIdentity(ageSecretKey);

const plaintext = await decrypter.decrypt(decoded, "text");
const secrets = parseFlatYaml(plaintext);
const pilot = parseFlatYaml(readFileSync("pilot.yaml", "utf8"));

writeGitHubEnv("AI_API_KEY", secrets["aiApiKey"] ?? "");
writeGitHubEnv("GIT_SYNC_TOKEN", secrets["gitSyncToken"] ?? "");
writeGitHubEnv("MCP_AUTH_TOKEN", secrets["mcpAuthToken"] ?? "");
writeGitHubEnv("DISCORD_BOT_TOKEN", secrets["discordBotToken"] ?? "");

writeGitHubOutput(
  "shared_ai_api_key_secret_name",
  requireFlatValue(pilot, "aiApiKey", "pilot.yaml"),
);
writeGitHubOutput(
  "shared_git_sync_token_secret_name",
  requireFlatValue(pilot, "gitSyncToken", "pilot.yaml"),
);
writeGitHubOutput(
  "shared_mcp_auth_token_secret_name",
  requireFlatValue(pilot, "mcpAuthToken", "pilot.yaml"),
);

function extractAgeIdentity(contents: string): string {
  const line = contents
    .split(/\r?\n/)
    .map((entry) => entry.trim())
    .find((entry) => entry.startsWith("AGE-SECRET-KEY-"));

  if (!line) {
    throw new Error("Missing AGE-SECRET-KEY in AGE_SECRET_KEY");
  }

  return line;
}

function parseFlatYaml(contents: string): Record<string, string> {
  const result: Record<string, string> = {};

  for (const rawLine of contents.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) {
      continue;
    }

    const match = line.match(/^([A-Za-z0-9_]+):\s*(.*)$/);
    if (!match) {
      continue;
    }

    const [, key, rawValue] = match;
    result[key] = rawValue.replace(/^['"]|['"]$/g, "");
  }

  return result;
}

function requireFlatValue(
  values: Record<string, string>,
  key: string,
  label: string,
): string {
  const value = values[key];
  if (!value) {
    throw new Error(`Missing ${key} in ${label}`);
  }
  return value;
}
