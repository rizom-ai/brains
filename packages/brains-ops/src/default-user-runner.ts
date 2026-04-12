import type { ResolvedUser } from "./load-registry";
import type { UserRunResult } from "./reconcile-lib";
import { deriveUserSecretNames } from "./user-secret-names";

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
  const secretNames = deriveUserSecretNames(user.handle);
  const lines = [
    `BRAIN_VERSION=${user.brainVersion}`,
    `AI_API_KEY_SECRET=${user.effectiveAiApiKey}`,
    `GIT_SYNC_TOKEN_SECRET=${secretNames.gitSyncTokenSecretName}`,
    `MCP_AUTH_TOKEN_SECRET=${secretNames.mcpAuthTokenSecretName}`,
  ];

  if (user.discordEnabled) {
    lines.push(
      `DISCORD_BOT_TOKEN_SECRET=${secretNames.discordBotTokenSecretName}`,
    );
  }

  lines.push(`CONTENT_REPO=${githubOrg}/${user.contentRepo}`);
  lines.push("");

  return lines.join("\n");
}
