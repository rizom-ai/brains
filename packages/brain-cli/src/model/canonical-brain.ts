import {
  defineBrain,
  type BrainDefinition,
  type CapabilityEntry,
  type PluginConfig,
  type PluginFactory,
} from "@brains/app";
import {
  bindPluginPackageMetadata,
  instantiatePluginPackageDefinition,
  type Plugin,
  type PluginPackageDefinition,
} from "@brains/plugins";
import { A2AInterface } from "@brains/a2a";
import adminPackage from "@brains/admin";
import { agentDiscovery } from "@brains/agent-discovery";
import analyticsPackage from "@brains/analytics";
import assessmentPackage from "@brains/assessment";
import { atprotoPlugin } from "@brains/atproto";
import atprotoRegistryPackage from "@brains/atproto-registry";
import { authServicePlugin } from "@brains/auth-service";
import blogPackage from "@brains/blog";
import { ChatInterface, chatConfigFromEnv } from "@brains/chat";
import { studioPlugin } from "@brains/studio";
import { contentPipelinePlugin } from "@brains/content-pipeline";
import conversationMemoryPackage from "@brains/conversation-memory";
import { dashboardPlugin } from "@brains/dashboard";
import decksPackage from "@brains/decks";
import { directorySync } from "@brains/directory-sync";
import docPackage from "@brains/doc";
import documentPackage from "@brains/document-plugin";
import emailPackage from "@brains/email";
import { emailWorkflows } from "@brains/email-workflows";
import imagePackage from "@brains/image-plugin";
import linkPackage from "@brains/link";
import { MCPInterface } from "@brains/mcp";
import { newsletter } from "@brains/newsletter";
import notePackage from "@brains/note";
import notificationsPackage from "@brains/notifications";
import obsidianVaultPackage from "@brains/obsidian-vault";
import playbooksPackage from "@brains/playbooks";
import portfolioPackage from "@brains/portfolio";
import profilePackage from "@brains/profile";
import promptPackage from "@brains/prompt";
import onboardingPackage from "@brains/onboarding";
import seriesPackage from "@brains/series";
import { siteBuilderPlugin } from "@brains/site-builder-plugin";
import { siteContentPlugin } from "@brains/site-content";
import siteInfoPackage from "@brains/site-info";
import socialMediaPackage from "@brains/social-media";
import { stockPhotoPlugin } from "@brains/stock-photo";
import styleGuidePackage from "@brains/style-guide";
import topicsPackage from "@brains/topics";
import knowledgeMapPackage from "@brains/knowledge-map";
import unifiedInboxPackage from "@brains/unified-inbox";
import { WebChatInterface } from "@brains/web-chat";
import { WebserverInterface } from "@brains/webserver";
import wishlistPackage from "@brains/wishlist";
import packageJson from "../../package.json" with { type: "json" };
import {
  automationBundle,
  AUTOMATION_BUNDLE_ID,
  CANONICAL_BUNDLE_CONTRACT,
  canonicalBundles,
  chatBundle,
  CHAT_BUNDLE_ID,
  coreBundle,
  CORE_BUNDLE_ID,
  federationBundle,
  FEDERATION_BUNDLE_ID,
  mediaBundle,
  MEDIA_BUNDLE_ID,
  publishingBundle,
  PUBLISHING_BUNDLE_ID,
  siteBundle,
  SITE_BUNDLE_ID,
  teamBundle,
  TEAM_BUNDLE_ID,
  webBundle,
  WEB_BUNDLE_ID,
} from "./canonical-bundles";

export {
  automationBundle,
  AUTOMATION_BUNDLE_ID,
  CANONICAL_BUNDLE_CONTRACT,
  chatBundle,
  CHAT_BUNDLE_ID,
  coreBundle,
  CORE_BUNDLE_ID,
  federationBundle,
  FEDERATION_BUNDLE_ID,
  mediaBundle,
  MEDIA_BUNDLE_ID,
  publishingBundle,
  PUBLISHING_BUNDLE_ID,
  siteBundle,
  SITE_BUNDLE_ID,
  teamBundle,
  TEAM_BUNDLE_ID,
  webBundle,
  WEB_BUNDLE_ID,
};

/**
 * Building the plugins a declaratively-defined package installs.
 *
 * Packages resolved from a `brain.yaml` package ref get their installed
 * metadata bound by the package registry. The canonical brain imports its
 * members directly instead, so nothing binds metadata for them — this does it
 * from the workspace package name, then instantiates.
 *
 * Both lists come through here: a declared interface and a declared
 * capability differ only in the tuple that carries the factory, not in how
 * the factory is made.
 *
 * This lives in layer 3 on purpose: instantiation is the composer's job, so
 * declaratively-authored packages never need to reach for shell internals.
 */
function packageFactory(
  packageName: string,
  definition: PluginPackageDefinition,
): PluginFactory {
  const metadata = { name: packageName, version: packageJson.version };
  bindPluginPackageMetadata(definition, metadata);
  return (config): Plugin[] =>
    instantiatePluginPackageDefinition(definition, config, metadata);
}

function packageCapability(
  id: string,
  packageName: string,
  definition: PluginPackageDefinition,
): CapabilityEntry {
  return [id, packageFactory(packageName, definition), undefined];
}

/** Canonical catalog and active capability-bundle taxonomy. */
export const canonicalBrain: BrainDefinition = defineBrain({
  name: "brain",
  version: packageJson.version,
  bundleContract: CANONICAL_BUNDLE_CONTRACT,
  model: "gpt-5.6-luna",
  reasoningEffort: "low",
  capabilities: [
    packageCapability("prompt", "@brains/prompt", promptPackage),
    packageCapability("profile", "@brains/profile", profilePackage),
    packageCapability("style-guide", "@brains/style-guide", styleGuidePackage),
    packageCapability("image", "@brains/image-plugin", imagePackage),
    packageCapability("document", "@brains/document-plugin", documentPackage),
    packageCapability("note", "@brains/note", notePackage),
    packageCapability("link", "@brains/link", linkPackage),
    packageCapability("wishlist", "@brains/wishlist", wishlistPackage),
    packageCapability("topics", "@brains/topics", topicsPackage),
    packageCapability(
      "knowledge-map",
      "@brains/knowledge-map",
      knowledgeMapPackage,
    ),
    packageCapability("decks", "@brains/decks", decksPackage),
    [
      "directory-sync",
      directorySync,
      {
        seedContent: true,
        seedContentPath: "./seed-content",
        initialSync: true,
      },
    ],
    packageCapability(
      "atproto-registry",
      "@brains/atproto-registry",
      atprotoRegistryPackage,
    ),
    packageCapability("agents", "@brains/agent-discovery", agentDiscovery),
    packageCapability("assessment", "@brains/assessment", assessmentPackage),
    ["auth-service", authServicePlugin, undefined],
    packageCapability(
      "notifications",
      "@brains/notifications",
      notificationsPackage,
    ),

    packageCapability("playbooks", "@brains/playbooks", playbooksPackage),
    packageCapability("onboarding", "@brains/onboarding", onboardingPackage),
    ["studio", studioPlugin, undefined],
    ["dashboard", dashboardPlugin, undefined],
    packageCapability("admin", "@brains/admin", adminPackage),

    packageCapability("site-info", "@brains/site-info", siteInfoPackage),
    ["site-content", siteContentPlugin, undefined],
    ["site-builder", siteBuilderPlugin, undefined],
    packageCapability("analytics", "@brains/analytics", analyticsPackage),

    packageCapability("blog", "@brains/blog", blogPackage),
    packageCapability("series", "@brains/series", seriesPackage),
    packageCapability("portfolio", "@brains/portfolio", portfolioPackage),
    ["content-pipeline", contentPipelinePlugin, undefined],
    packageCapability(
      "social-media",
      "@brains/social-media",
      socialMediaPackage,
    ),
    ["newsletter", newsletter, undefined],
    ["stock-photo", stockPhotoPlugin, undefined],
    [
      "atproto",
      atprotoPlugin,
      (env): PluginConfig => ({
        ...(env["ATPROTO_APP_PASSWORD"]
          ? { appPassword: env["ATPROTO_APP_PASSWORD"] }
          : {}),
      }),
    ],

    packageCapability(
      "conversation-memory",
      "@brains/conversation-memory",
      conversationMemoryPackage,
    ),
    packageCapability("docs", "@brains/doc", docPackage),

    // autoSync was never a config key the schema accepted — it was silently
    // stripped and the plugin always synced on ready. Dropped rather than
    // carried as decoration.
    packageCapability(
      "obsidian-vault",
      "@brains/obsidian-vault",
      obsidianVaultPackage,
    ),
    ["email-workflows", emailWorkflows, undefined],
    packageCapability(
      "unified-inbox",
      "@brains/unified-inbox",
      unifiedInboxPackage,
    ),
  ],
  interfaces: [
    [
      "mcp",
      (config): Plugin => new MCPInterface(config),
      (): PluginConfig => ({}),
    ],
    [
      "email",
      packageFactory("@brains/email", emailPackage),
      (): PluginConfig => ({}),
    ],
    [
      "webserver",
      (config): Plugin => new WebserverInterface(config),
      (): PluginConfig => ({}),
    ],
    [
      "web-chat",
      (config): Plugin => new WebChatInterface(config),
      (): PluginConfig => ({}),
    ],
    [
      "chat",
      (config): Plugin => new ChatInterface(config),
      (env): PluginConfig => chatConfigFromEnv(env, { captureUrls: true }),
    ],
    [
      "a2a",
      (config): Plugin => new A2AInterface(config),
      (): PluginConfig => ({}),
    ],
  ],
  bundles: canonicalBundles,
  permissions: {
    rules: [
      { pattern: "cli:*", level: "admin" },
      { pattern: "mcp:stdio", level: "admin" },
    ],
  },
  deployment: {
    cdn: {
      enabled: true,
      provider: "bunny",
    },
    dns: {
      enabled: true,
      provider: "bunny",
    },
  },
});

export default canonicalBrain;
