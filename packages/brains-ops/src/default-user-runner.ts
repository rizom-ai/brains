import { deepMerge } from "@brains/utils/config-merge";
import { runtimeImageTag, sitePackagesFor } from "./images";
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
            setupEmail: user.setup.email,
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
  const sitePackages = sitePackagesFor(user.siteOverride);
  return [
    `BRAIN_VERSION=${user.brainVersion}`,
    // An instance with site pins names the image it runs, so a pin change is
    // a changed config, and so a deploy; a plain instance runs the plain
    // image and its env says only its version.
    ...(sitePackages.length > 0
      ? [`IMAGE_TAG=${runtimeImageTag(user.brainVersion, sitePackages)}`]
      : []),
    `CONTENT_REPO=${renderContentRepoRef(user, githubOrg)}`,
    "",
  ].join("\n");
}
