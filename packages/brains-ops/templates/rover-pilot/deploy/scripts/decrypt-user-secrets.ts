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

writeSecretGitHubEnv("AI_API_KEY", secrets["aiApiKey"]);
writeSecretGitHubEnv("GIT_SYNC_TOKEN", secrets["gitSyncToken"]);
writeSecretGitHubEnv(
  "CMS_CONTENT_REPO_PAT",
  secrets["cmsContentRepoPat"] ?? secrets["gitSyncToken"],
);
writeSecretGitHubEnv("DISCORD_BOT_TOKEN", secrets["discordBotToken"]);
// Per-user AT Protocol publishing credential (optional; from the user's
// encrypted secrets file). The scaffold wires this so a pilot can publish its
// brain's agent card to its PDS; a deployment that doesn't publish simply
// leaves it unset. TLS material (CERTIFICATE_PEM/PRIVATE_KEY_PEM) is handled by
// the kamal proxy block via shared env, not here.
writeSecretGitHubEnv("ATPROTO_APP_PASSWORD", secrets["atprotoAppPassword"]);

writeGitHubOutput(
  "shared_ai_api_key_secret_name",
  requireFlatValue(pilot, "aiApiKey", "pilot.yaml"),
);
writeGitHubOutput(
  "shared_git_sync_token_secret_name",
  requireFlatValue(pilot, "gitSyncToken", "pilot.yaml"),
);
writeGitHubOutput(
  "shared_content_repo_admin_token_secret_name",
  requireFlatValue(pilot, "contentRepoAdminToken", "pilot.yaml"),
);

function writeSecretGitHubEnv(name: string, value: string | undefined): void {
  if (!value || value.trim().length === 0) {
    return;
  }

  maskGitHubSecret(value);
  writeGitHubEnv(name, value);
}

function maskGitHubSecret(value: string): void {
  const escaped = value
    .replace(/%/g, "%25")
    .replace(/\r/g, "%0D")
    .replace(/\n/g, "%0A");
  if (escaped.length > 0 && process.env["GITHUB_ACTIONS"] === "true") {
    console.log(`::add-mask::${escaped}`);
  }
}

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
