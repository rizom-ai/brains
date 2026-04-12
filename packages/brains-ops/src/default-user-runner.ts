import type { ResolvedUser } from "./load-registry";
import type { UserRunResult } from "./reconcile-lib";

export function createDefaultUserRunner(
  githubOrg: string,
): (user: ResolvedUser) => Promise<UserRunResult> {
  return async (user: ResolvedUser): Promise<UserRunResult> => ({
    brainYaml: renderUserBrainYaml(user, githubOrg),
    envFile: renderUserEnv(user, githubOrg),
  });
}

function renderUserBrainYaml(user: ResolvedUser, githubOrg: string): string {
  const lines = [
    `brain: ${user.model}`,
    `domain: ${user.domain}`,
    `preset: ${user.preset}`,
    "",
    "anchors: []",
    "",
    "plugins:",
    "  directory-sync:",
    "    git:",
    `      repo: ${githubOrg}/${user.contentRepo}`,
    "      authToken: ${GIT_SYNC_TOKEN}",
    "  mcp:",
    "    authToken: ${MCP_AUTH_TOKEN}",
  ];

  if (user.discordEnabled) {
    lines.push("  discord:");
    lines.push("    botToken: ${DISCORD_BOT_TOKEN}");
  }

  lines.push("");

  return lines.join("\n");
}

function renderUserEnv(user: ResolvedUser, githubOrg: string): string {
  const handleSuffix = toSecretSuffix(user.handle);
  const lines = [
    `AI_API_KEY_SECRET=${user.effectiveAiApiKey}`,
    `GIT_SYNC_TOKEN_SECRET=GIT_SYNC_TOKEN_${handleSuffix}`,
    `MCP_AUTH_TOKEN_SECRET=MCP_AUTH_TOKEN_${handleSuffix}`,
  ];

  if (user.discordEnabled) {
    lines.push(`DISCORD_BOT_TOKEN_SECRET=DISCORD_BOT_TOKEN_${handleSuffix}`);
  }

  lines.push(`CONTENT_REPO=${githubOrg}/${user.contentRepo}`);
  lines.push("");

  return lines.join("\n");
}

function toSecretSuffix(handle: string): string {
  return handle.replaceAll("-", "_").toUpperCase();
}
