import { deepMerge } from "@brains/utils/config-merge";
import { toYaml } from "@brains/utils/yaml";
import { renderContentRepoRef as renderRepoRef } from "./content-repo-ref";
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
  const defaults = {
    ...(user.setup?.delivery === "email"
      ? {
          "auth-service": {
            setupEmail: createSetupEmailConfig(user.setup.email),
          },
          notifications: {
            defaultRecipient: { type: "email", address: user.setup.email },
          },
          email: {
            transport: "resend",
            apiKey: "${SETUP_EMAIL_API_KEY}",
            from: "${SETUP_EMAIL_FROM}",
          },
        }
      : {}),
    ...(user.playbooks?.onboarding ? { onboarding: { enabled: true } } : {}),
    ...(user.topicExtractionEnabled !== undefined
      ? { topics: { enableAutoExtraction: user.topicExtractionEnabled } }
      : {}),
    ...(user.skillDerivationEnabled !== undefined
      ? { agents: { enableSkillDerivation: user.skillDerivationEnabled } }
      : {}),
    ...(user.swotDerivationEnabled !== undefined
      ? { assessment: { enableSwotDerivation: user.swotDerivationEnabled } }
      : {}),
    "directory-sync": {
      git: {
        repo: renderContentRepoRef(user, githubOrg),
        authToken: "${GIT_SYNC_TOKEN}",
      },
    },
    ...(user.atproto
      ? { atproto: { ...user.atproto, appPassword: "${ATPROTO_APP_PASSWORD}" } }
      : {}),
  };

  return toYaml({
    brain: "brain",
    bundleContract: user.bundleContract,
    kind: user.profileKind ?? "professional",
    domain: user.domain,
    bundles: user.bundles,
    ...(user.embeddingEnabled !== undefined
      ? { embedding: { enabled: user.embeddingEnabled } }
      : {}),
    ...(user.add.length > 0 ? { add: user.add } : {}),
    ...(user.remove.length > 0 ? { remove: user.remove } : {}),
    ...(user.siteOverride
      ? {
          site: {
            package: user.siteOverride.package,
            ...(user.siteOverride.theme
              ? { theme: user.siteOverride.theme }
              : {}),
          },
        }
      : {}),
    anchors:
      user.discordEnabled && user.discordAnchorUserId
        ? [`discord:${user.discordAnchorUserId}`]
        : [],
    plugins: deepMerge(defaults, user.plugins ?? {}, { nulls: "preserve" }),
  });
}

function renderContentRepoRef(user: ResolvedUser, githubOrg: string): string {
  return renderRepoRef(user.contentRepo, githubOrg);
}

function createSetupEmailConfig(email: string): {
  to: string;
  subject: string;
  body: string;
} {
  return {
    to: email,
    subject: "Welcome to Rover — set up your passkey",
    body: [
      "Hi,",
      "",
      "Your Rover is ready.",
      "",
      "Rover is your own AI — a private assistant deployed just for you, that holds your notes, links, and ideas, and gets more useful the more you put into it.",
      "",
      "Set up your passkey:",
      "{{setupUrl}}",
      "",
      "This link is single-use. Do not forward it.",
      "It expires at {{expiresAt}}.",
      "",
      "After setup, open your chat and say hello:",
      "{{origin}}/chat",
      "",
      "Sign in with the passkey you just registered. The chat in your browser is where you and Rover will spend most of your time.",
      "",
      "The onboarding guide shows the way of working — capture, ask back, shape:",
      "https://github.com/rizom-ai/brains/blob/main/packages/brains-ops/templates/rover-pilot/docs/user-onboarding.md",
      "",
      "If this link is expired, does not work, or you did not expect this email, reply to your Rover operator and we will help.",
      "",
    ].join("\n"),
  };
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
  return [
    `BRAIN_VERSION=${user.brainVersion}`,
    `CONTENT_REPO=${renderContentRepoRef(user, githubOrg)}`,
    "",
  ].join("\n");
}
