import { toYaml } from "@brains/utils";
import type { ResolvedUser } from "./load-registry";
import type { ContentRepoFile, UserRunResult } from "./user-runner";
import { deriveUserSecretNames } from "./user-secret-names";

export function createDefaultUserRunner(
  githubOrg: string,
): (user: ResolvedUser) => Promise<UserRunResult> {
  return async (user: ResolvedUser): Promise<UserRunResult> => ({
    brainYaml: renderUserBrainYaml(user, githubOrg),
    envFile: renderUserEnv(user, githubOrg),
    contentRepoFiles: renderContentRepoFiles(user),
  });
}

function renderUserBrainYaml(user: ResolvedUser, githubOrg: string): string {
  const lines = [
    `brain: ${user.model}`,
    `domain: ${user.domain}`,
    `preset: ${user.preset}`,
    "",
    renderAnchors(user),
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

function renderAnchors(user: ResolvedUser): string {
  if (user.discordEnabled && user.discordAnchorUserId) {
    return `anchors: ["discord:${user.discordAnchorUserId}"]`;
  }

  return "anchors: []";
}

function renderContentRepoFiles(user: ResolvedUser): ContentRepoFile[] {
  return [
    {
      path: "anchor-profile/anchor-profile.md",
      content: renderAnchorProfile(user),
    },
  ];
}

function renderAnchorProfile(user: ResolvedUser): string {
  const frontmatter: Record<string, unknown> = {
    kind: "professional",
    name: user.anchorProfile.name,
    ...(user.anchorProfile.description
      ? { description: user.anchorProfile.description }
      : {}),
    ...(user.anchorProfile.website
      ? { website: user.anchorProfile.website }
      : {}),
    ...(user.anchorProfile.email ? { email: user.anchorProfile.email } : {}),
    ...(user.anchorProfile.socialLinks
      ? { socialLinks: user.anchorProfile.socialLinks }
      : {}),
  };
  const body =
    user.anchorProfile.story ??
    "This profile was initialized by brains-ops. Edit it in your content repo.";

  return `---\n${toYaml(frontmatter).trimEnd()}\n---\n\n${body}\n`;
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
