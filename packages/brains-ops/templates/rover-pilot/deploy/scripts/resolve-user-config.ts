import { readFileSync } from "node:fs";
import { parseEnvFile, requireEnv, writeGitHubOutput } from "./helpers";

const handle = requireEnv("HANDLE");
const envPath = `users/${handle}/.env`;
const brainYamlPath = `users/${handle}/brain.yaml`;

const envEntries = parseEnvFile(envPath);
const repository = process.env["GITHUB_REPOSITORY"] ?? "";
const repositoryOwner = repository.split("/")[0] ?? "";

const brainYaml = readFileSync(brainYamlPath, "utf8");
const domainMatch = brainYaml.match(/^domain:\s*(.+)$/m);
const brainDomain = domainMatch?.[1]?.trim().replace(/^['"]|['"]$/g, "") ?? "";

if (!brainDomain) {
  throw new Error(`Missing domain in ${brainYamlPath}`);
}

const outputs: Record<string, string> = {
  brain_version: envEntries["BRAIN_VERSION"] ?? "",
  ai_api_key_secret_name: envEntries["AI_API_KEY_SECRET"] ?? "",
  git_sync_token_secret_name: envEntries["GIT_SYNC_TOKEN_SECRET"] ?? "",
  mcp_auth_token_secret_name: envEntries["MCP_AUTH_TOKEN_SECRET"] ?? "",
  discord_bot_token_secret_name: envEntries["DISCORD_BOT_TOKEN_SECRET"] ?? "",
  content_repo: envEntries["CONTENT_REPO"] ?? "",
  brain_domain: brainDomain,
  brain_yaml_path: brainYamlPath,
  instance_name: `rover-${handle}`,
  image_repository: `ghcr.io/${repository}`,
  registry_username: repositoryOwner,
};

const required = [
  "brain_version",
  "ai_api_key_secret_name",
  "git_sync_token_secret_name",
  "mcp_auth_token_secret_name",
  "registry_username",
];
for (const key of required) {
  if (!outputs[key]) {
    throw new Error(`Missing ${key} (derived from ${envPath})`);
  }
}

for (const [key, value] of Object.entries(outputs)) {
  writeGitHubOutput(key, value);
}
