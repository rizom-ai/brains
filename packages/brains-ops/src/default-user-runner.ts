import { toYaml } from "@brains/utils";
import type { ResolvedUser } from "./load-registry";
import type { ContentRepoFile, UserRunResult } from "./user-runner";

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
    ...(user.setup?.delivery === "email"
      ? ["  auth-service:", ...renderSetupEmailConfig(user.setup.email)]
      : []),
    "  directory-sync:",
    "    git:",
    `      repo: ${githubOrg}/${user.contentRepo}`,
    "      authToken: ${GIT_SYNC_TOKEN}",
    ...(user.atproto
      ? [
          "  atproto:",
          `    identifier: ${user.atproto.identifier}`,
          "    appPassword: ${ATPROTO_APP_PASSWORD}",
        ]
      : []),
  ];

  if (user.discordEnabled) {
    lines.push("  discord:");
    lines.push("    botToken: ${DISCORD_BOT_TOKEN}");
  }

  if (user.setup?.delivery === "email") {
    lines.push("  email-resend:");
    lines.push("    apiKey: ${SETUP_EMAIL_API_KEY}");
    lines.push("    from: ${SETUP_EMAIL_FROM}");
  }

  lines.push("");

  return lines.join("\n");
}

function renderSetupEmailConfig(email: string): string[] {
  return [
    "    setupEmail:",
    `      to: ${email}`,
    "      subject: Welcome to Rover — set up your passkey",
    "      body: |",
    "        Hi,",
    "",
    "        Your Rover is ready.",
    "",
    "        Rover is your private AI assistant for working with your own notes, links, and ideas.",
    "",
    "        Set up your passkey:",
    "        {{setupUrl}}",
    "",
    "        This link is single-use. Do not forward it.",
    "        It expires at {{expiresAt}}.",
    "",
    "        After setup, open your chat and say hello:",
    "        {{origin}}/chat",
    "",
    "        Sign in with the passkey you just registered. The chat in your browser is where you and Rover will spend most of your time.",
    "",
    "        The onboarding guide walks you through your first week:",
    "        https://github.com/rizom-ai/brains/blob/main/packages/brains-ops/templates/rover-pilot/docs/user-onboarding.md",
    "",
    "        If this link is expired, does not work, or you did not expect this email, reply to your Rover operator and we will help.",
  ];
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
  const lines = [
    `BRAIN_VERSION=${user.brainVersion}`,
    `CONTENT_REPO=${githubOrg}/${user.contentRepo}`,
    "",
  ];

  return lines.join("\n");
}
