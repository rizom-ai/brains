import { toYaml } from "@brains/utils/yaml";
import { renderContentRepoRef as renderRepoRef } from "./content-repo-ref";
import type {
  ResolvedAtprotoJetstreamConfig,
  ResolvedUser,
} from "./load-registry";
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
    "brain: brain",
    `bundleContract: ${user.bundleContract}`,
    `kind: ${user.profileKind ?? "professional"}`,
    `domain: ${user.domain}`,
    "bundles:",
    ...user.bundles.map((bundle) => `  - ${bundle}`),
    ...(user.embeddingEnabled !== undefined
      ? ["", "embedding:", `  enabled: ${String(user.embeddingEnabled)}`]
      : []),
    ...renderMemberOverrides("add", user.add),
    ...renderMemberOverrides("remove", user.remove),
    ...renderSiteConfig(user),
    "",
    renderAnchors(user),
    "",
    "plugins:",
    ...(user.setup?.delivery === "email"
      ? [
          "  auth-service:",
          ...renderSetupEmailConfig(user.setup.email),
          "  notifications:",
          "    defaultRecipient:",
          "      type: email",
          `      address: ${user.setup.email}`,
        ]
      : []),
    ...(user.playbooks?.onboarding
      ? ["  onboarding:", "    enabled: true"]
      : []),
    ...(user.topicExtractionEnabled !== undefined
      ? [
          "  topics:",
          `    enableAutoExtraction: ${String(user.topicExtractionEnabled)}`,
        ]
      : []),
    ...(user.skillDerivationEnabled !== undefined
      ? [
          "  agents:",
          `    enableSkillDerivation: ${String(user.skillDerivationEnabled)}`,
        ]
      : []),
    ...(user.swotDerivationEnabled !== undefined
      ? [
          "  assessment:",
          `    enableSwotDerivation: ${String(user.swotDerivationEnabled)}`,
        ]
      : []),
    "  directory-sync:",
    "    git:",
    `      repo: ${renderContentRepoRef(user, githubOrg)}`,
    "      authToken: ${GIT_SYNC_TOKEN}",
    ...(user.atproto
      ? [
          "  atproto:",
          `    identifier: ${user.atproto.identifier}`,
          ...(user.atproto.accountDid
            ? [`    accountDid: ${user.atproto.accountDid}`]
            : []),
          ...(user.atproto.lexiconAuthority !== undefined
            ? [`    lexiconAuthority: ${String(user.atproto.lexiconAuthority)}`]
            : []),
          ...renderJetstreamConfig(user.atproto.jetstream),
          "    appPassword: ${ATPROTO_APP_PASSWORD}",
        ]
      : []),
  ];

  if (user.setup?.delivery === "email") {
    lines.push("  email:");
    lines.push("    transport: resend");
    lines.push("    apiKey: ${SETUP_EMAIL_API_KEY}");
    lines.push("    from: ${SETUP_EMAIL_FROM}");
  }

  lines.push("");

  return lines.join("\n");
}

function renderJetstreamConfig(
  config: ResolvedAtprotoJetstreamConfig | undefined,
): string[] {
  if (!config) return [];
  const rendered = toYaml(config).trimEnd().split("\n");
  return ["    jetstream:", ...rendered.map((line) => `      ${line}`)];
}

function renderMemberOverrides(key: "add" | "remove", ids: string[]): string[] {
  if (ids.length === 0) return [];
  return ["", `${key}:`, ...ids.map((id) => `  - ${id}`)];
}

function renderSiteConfig(user: ResolvedUser): string[] {
  if (!user.siteOverride) {
    return [];
  }

  return [
    "",
    "site:",
    `  package: ${quoteYamlString(user.siteOverride.package)}`,
    ...(user.siteOverride.theme
      ? [`  theme: ${quoteYamlString(user.siteOverride.theme)}`]
      : []),
  ];
}

function quoteYamlString(value: string): string {
  return JSON.stringify(value);
}

function renderContentRepoRef(user: ResolvedUser, githubOrg: string): string {
  return renderRepoRef(user.contentRepo, githubOrg);
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
    "        Rover is your own AI — a private assistant deployed just for you, that holds your notes, links, and ideas, and gets more useful the more you put into it.",
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
    "        The onboarding guide shows the way of working — capture, ask back, shape:",
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
    `CONTENT_REPO=${renderContentRepoRef(user, githubOrg)}`,
    "",
  ];

  return lines.join("\n");
}
