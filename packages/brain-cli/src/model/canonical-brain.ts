import {
  defineBrain,
  type BrainDefinition,
  type CapabilityConfig,
  type CapabilityEntry,
  type InterfaceEntry,
  type PluginConfig,
} from "@brains/app";
import {
  instantiatePluginPackageDefinition,
  type Plugin,
  type PluginPackageDefinition,
  type PluginPackageInstantiationOptions,
} from "@brains/plugins";
import a2aInterface from "@brains/a2a";
import adminPackage from "@brains/admin";
import { agentDiscovery } from "@brains/agent-discovery";
import { analyticsPlugin } from "@brains/analytics";
import { assessment } from "@brains/assessment";
import { atprotoPlugin } from "@brains/atproto";
import atprotoRegistryPackage from "@brains/atproto-registry";
import { authServicePlugin } from "@brains/auth-service";
import blogPackage from "@brains/blog";
import chatInterface, { chatConfigFromEnv } from "@brains/chat";
import { studioPlugin } from "@brains/studio";
import { contentPipelinePlugin } from "@brains/content-pipeline";
import { contactPlugin } from "@brains/contact";
import { formPlugin } from "@brains/form";
import { quizPlugin } from "@brains/quiz";
import { conversationMemoryPlugin } from "@brains/conversation-memory";
import { faqPlugin } from "@brains/faq";
import { dashboardPlugin } from "@brains/dashboard";
import decksPackage from "@brains/decks";
import { directorySync } from "@brains/directory-sync";
import docsPackage from "@brains/doc";
import { guidesPlugin } from "@brains/guide";
import { bookPlugin } from "@brains/book";
import documentPackage from "@brains/document-plugin";
import emailInterface from "@brains/email";
import { emailWorkflows } from "@brains/email-workflows";
import imagePackage from "@brains/image-plugin";
import linkPackage from "@brains/link";
import mcpInterface from "@brains/mcp";
import { newsletter } from "@brains/newsletter";
import notePackage from "@brains/note";
import notificationsPackage from "@brains/notifications";
import { linkedInImportPlugin } from "@brains/linkedin-import";
import { createLinkedInBrokerProvider } from "@brains/linkedin-import/broker-provider";
import {
  oauthBrokerPlugin,
  type OAuthBrokerPlugin,
} from "@brains/oauth-broker";
import obsidianVaultPackage from "@brains/obsidian-vault";
import playbooksPackage from "@brains/playbooks";
import portfolioPackage from "@brains/portfolio";
import profilePackage from "@brains/profile";
import promptPackage from "@brains/prompt";
import onboardingPackage from "@brains/onboarding";
import seriesPackage from "@brains/series";
import siteBuilderPackage from "@brains/site-builder-plugin";
import { siteContentPlugin } from "@brains/site-content";
import siteInfoPackage from "@brains/site-info";
import socialMediaPackage from "@brains/social-media";
import stockPhotoPackage from "@brains/stock-photo";
import styleGuidePackage from "@brains/style-guide";
import askContentPackage from "@brains/ask-content";
import { topicsPlugin } from "@brains/topics";
import knowledgeMapPackage from "@brains/knowledge-map";
import unifiedInboxPackage from "@brains/unified-inbox";
import { actionBoardPlugin } from "@brains/action-board";
import webChatInterface from "@brains/web-chat";
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
 * How the canonical brain builds the plugins of a package that is a declarative
 * definition. It imports its members directly rather than resolving
 * installed packages, so it names each definition's package itself;
 * packages release in lockstep with the CLI, so they share its version. A
 * converted first-party package keeps the plugin id its class had, and with
 * it the template, data source, job and channel names brains, sites and
 * queued jobs already use.
 */
function packagePlugins(
  packageName: string,
  definition: PluginPackageDefinition,
  options: PluginPackageInstantiationOptions,
): (config: PluginConfig) => Plugin[] {
  const metadata = { name: packageName, version: packageJson.version };
  return (config) =>
    instantiatePluginPackageDefinition(definition, config, metadata, options);
}

/** A capability whose package is a declarative definition. */
function packageCapability(
  id: string,
  packageName: string,
  definition: PluginPackageDefinition,
  options: PluginPackageInstantiationOptions = {},
  /** The config the catalog gives the capability, as its class entry did. */
  defaults: CapabilityConfig = undefined,
): CapabilityEntry {
  return [id, packagePlugins(packageName, definition, options), defaults];
}

/**
 * An interface whose package is a declarative definition, configured from
 * the deployment environment as its class entry was.
 */
function packageInterface(
  id: string,
  packageName: string,
  definition: PluginPackageDefinition,
  envMapper: InterfaceEntry[2],
  options: PluginPackageInstantiationOptions = {},
): InterfaceEntry {
  return [id, packagePlugins(packageName, definition, options), envMapper];
}

/** Canonical catalog and active capability-bundle taxonomy. */
export const canonicalBrain: BrainDefinition = defineBrain({
  name: "brain",
  version: packageJson.version,
  bundleContract: CANONICAL_BUNDLE_CONTRACT,
  model: "gpt-6-luna",
  reasoningEffort: "low",
  capabilities: [
    packageCapability("prompt", "@brains/prompt", promptPackage, {
      pluginId: "prompt",
    }),
    packageCapability("profile", "@brains/profile", profilePackage, {
      pluginId: "profile",
    }),
    packageCapability("style-guide", "@brains/style-guide", styleGuidePackage, {
      pluginId: "style-guide",
    }),
    packageCapability("ask-content", "@brains/ask-content", askContentPackage, {
      pluginId: "ask-content",
    }),
    packageCapability("image", "@brains/image-plugin", imagePackage, {
      pluginId: "image",
    }),
    packageCapability("document", "@brains/document-plugin", documentPackage, {
      pluginId: "document",
    }),
    packageCapability("note", "@brains/note", notePackage, {
      pluginId: "note",
    }),
    packageCapability("link", "@brains/link", linkPackage, {
      pluginId: "link",
    }),
    packageCapability("wishlist", "@brains/wishlist", wishlistPackage, {
      pluginId: "wishlist",
    }),
    // The knowledge map draws its territories from topics, so it comes and
    // goes with them, as it did while it lived in the topics package.
    [
      "topics",
      (config): Plugin[] => [
        topicsPlugin(config),
        ...instantiatePluginPackageDefinition(
          knowledgeMapPackage,
          {},
          { name: "@brains/knowledge-map", version: packageJson.version },
          { pluginId: "knowledge-map" },
        ),
      ],
      undefined,
    ],
    packageCapability("decks", "@brains/decks", decksPackage, {
      pluginId: "decks",
    }),
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
      { pluginId: "atproto-registry" },
    ),
    ["agents", agentDiscovery, undefined],
    ["assessment", assessment, undefined],
    ["auth-service", authServicePlugin, undefined],
    packageCapability(
      "notifications",
      "@brains/notifications",
      notificationsPackage,
      { pluginId: "notifications" },
    ),
    ["contact", contactPlugin, undefined],
    ["quiz", quizPlugin, undefined],
    // The playbooks service owns the playbook type: one capability installs
    // both plugins, playbook and playbooks, as the two capabilities did.
    packageCapability("playbooks", "@brains/playbooks", playbooksPackage, {
      pluginId: "playbooks",
    }),
    packageCapability("onboarding", "@brains/onboarding", onboardingPackage, {
      pluginId: "onboarding",
      dependencies: ["playbook", "playbooks"],
    }),
    ["studio", studioPlugin, undefined],
    ["dashboard", dashboardPlugin, undefined],
    packageCapability("admin", "@brains/admin", adminPackage, {
      pluginId: "admin",
    }),

    packageCapability("site-info", "@brains/site-info", siteInfoPackage, {
      pluginId: "site-metadata",
    }),
    ["site-content", siteContentPlugin, undefined],
    packageCapability(
      "site-builder",
      "@brains/site-builder-plugin",
      siteBuilderPackage,
      { pluginId: "site-builder" },
    ),
    ["form", formPlugin, undefined],
    ["analytics", analyticsPlugin, undefined],

    packageCapability("blog", "@brains/blog", blogPackage, {
      pluginId: "blog",
    }),
    packageCapability("series", "@brains/series", seriesPackage, {
      pluginId: "series",
    }),
    packageCapability("portfolio", "@brains/portfolio", portfolioPackage, {
      pluginId: "portfolio",
    }),
    ["content-pipeline", contentPipelinePlugin, undefined],
    packageCapability(
      "social-media",
      "@brains/social-media",
      socialMediaPackage,
      { pluginId: "social-media" },
    ),
    ["newsletter", newsletter, undefined],
    packageCapability("stock-photo", "@brains/stock-photo", stockPhotoPackage, {
      pluginId: "stock-photo",
    }),
    [
      "atproto",
      atprotoPlugin,
      (env): PluginConfig => ({
        ...(env["ATPROTO_APP_PASSWORD"]
          ? { appPassword: env["ATPROTO_APP_PASSWORD"] }
          : {}),
      }),
    ],

    ["conversation-memory", conversationMemoryPlugin, undefined],
    ["action-board", actionBoardPlugin, undefined],
    ["faq", faqPlugin, undefined],
    packageCapability("docs", "@brains/doc", docsPackage, {
      pluginId: "docs",
    }),
    ["guides", guidesPlugin, undefined],
    ["book", bookPlugin, undefined],

    packageCapability(
      "obsidian-vault",
      "@brains/obsidian-vault",
      obsidianVaultPackage,
      { pluginId: "obsidian-vault" },
      { autoSync: true },
    ),
    ["email-workflows", emailWorkflows, undefined],
    packageCapability(
      "unified-inbox",
      "@brains/unified-inbox",
      unifiedInboxPackage,
      { pluginId: "unified-inbox" },
    ),
    ["linkedin-import", linkedInImportPlugin, undefined],
    [
      "oauth-broker",
      (config): OAuthBrokerPlugin =>
        oauthBrokerPlugin(config, {
          providers: { linkedin: createLinkedInBrokerProvider },
        }),
      undefined,
    ],
  ],
  interfaces: [
    packageInterface(
      "mcp",
      "@brains/mcp",
      mcpInterface,
      (env): PluginConfig => ({
        ...(env["MCP_AUTH_TOKEN"] ? { authToken: env["MCP_AUTH_TOKEN"] } : {}),
      }),
      { pluginId: "mcp" },
    ),
    packageInterface(
      "email",
      "@brains/email",
      emailInterface,
      (): PluginConfig => ({}),
      {
        pluginId: "email",
      },
    ),
    packageInterface(
      "web-chat",
      "@brains/web-chat",
      webChatInterface,
      (): PluginConfig => ({}),
      { pluginId: "web-chat" },
    ),
    packageInterface(
      "chat",
      "@brains/chat",
      chatInterface,
      (env): PluginConfig => chatConfigFromEnv(env, { captureUrls: true }),
      { pluginId: "chat" },
    ),
    packageInterface(
      "a2a",
      "@brains/a2a",
      a2aInterface,
      (): PluginConfig => ({}),
      {
        pluginId: "a2a",
      },
    ),
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
