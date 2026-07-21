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
const secrets = parseStringYamlMapping(plaintext);
const pilot = parseStringYamlMapping(readFileSync("pilot.yaml", "utf8"));

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
// leaves it unset.
writeSecretGitHubEnv("ATPROTO_APP_PASSWORD", secrets["atprotoAppPassword"]);
// Per-user custom-domain TLS overrides the shared fleet certificate when a
// complete certificate/key pair is present in the encrypted user secrets.
const certificatePem = decodeEscapedSecret(secrets["certificatePem"]);
const privateKeyPem = decodeEscapedSecret(secrets["privateKeyPem"]);
if (Boolean(certificatePem) !== Boolean(privateKeyPem)) {
  throw new Error(
    "Custom-domain TLS secrets require both certificatePem and privateKeyPem",
  );
}
// A corrupted stored value would otherwise only surface as a kamal-proxy
// "unable to load certificate" failure after the container has already booted.
assertPemShape("certificatePem", certificatePem);
assertPemShape("privateKeyPem", privateKeyPem);
writeSecretGitHubEnv("CERTIFICATE_PEM", certificatePem);
writeSecretGitHubEnv("PRIVATE_KEY_PEM", privateKeyPem);

function assertPemShape(name: string, value: string | undefined): void {
  if (value === undefined || value.trim().length === 0) {
    return;
  }
  if (
    !/-----BEGIN [A-Z0-9 ]+-----/.test(value) ||
    !/-----END [A-Z0-9 ]+-----/.test(value)
  ) {
    throw new Error(
      `Secret ${name} is not PEM-shaped after unescaping; the stored value is corrupt`,
    );
  }
}

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

function parseStringYamlMapping(contents: string): Record<string, string> {
  const parsed: unknown = Bun.YAML.parse(contents);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Expected a YAML mapping");
  }

  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(parsed)) {
    if (typeof value === "string") {
      result[key] = value;
    }
  }
  return result;
}

function decodeEscapedSecret(value: string | undefined): string | undefined {
  return value?.replace(/\\n/g, "\n");
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
