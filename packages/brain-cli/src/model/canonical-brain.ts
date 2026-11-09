import {
  defineBrain,
  type BrainDefinition,
  type CapabilityConfig,
  type CapabilityEntry,
  type PluginConfig,
} from "@brains/app";
import {
  instantiatePluginPackageDefinition,
  type Plugin,
  type PluginPackageDefinition,
  type PluginPackageInstantiationOptions,
} from "@brains/plugins";
import { A2AInterface } from "@brains/a2a";
import { adminPlugin } from "@brains/admin";
import { agentDiscovery } from "@brains/agent-discovery";
import { analyticsPlugin } from "@brains/analytics";
import { assessment } from "@brains/assessment";
import { atprotoPlugin } from "@brains/atproto";
import atprotoRegistryPackage from "@brains/atproto-registry";
import { authServicePlugin } from "@brains/auth-service";
import blogPackage from "@brains/blog";
import { ChatInterface, chatConfigFromEnv } from "@brains/chat";
import { studioPlugin } from "@brains/studio";
import { contentPipelinePlugin } from "@brains/content-pipeline";
import { contactPlugin } from "@brains/contact";
import { conversationMemoryPlugin } from "@brains/conversation-memory";
import { faqPlugin } from "@brains/faq";
import { dashboardPlugin } from "@brains/dashboard";
import decksPackage from "@brains/decks";
import { directorySync } from "@brains/directory-sync";
import docsPackage from "@brains/doc";
import { guidesPlugin } from "@brains/guide";
import { bookPlugin } from "@brains/book";
import documentPackage from "@brains/document-plugin";
import { EmailInterface } from "@brains/email";
import { emailWorkflows } from "@brains/email-workflows";
import imagePackage from "@brains/image-plugin";
import linkPackage from "@brains/link";
import { MCPInterface } from "@brains/mcp";
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
import { playbookPlugin, playbooksPlugin } from "@brains/playbooks";
import portfolioPackage from "@brains/portfolio";
import profilePackage from "@brains/profile";
import promptPackage from "@brains/prompt";
import onboardingPackage from "@brains/onboarding";
import seriesPackage from "@brains/series";
import { siteBuilderPlugin } from "@brains/site-builder-plugin";
import { siteContentPlugin } from "@brains/site-content";
import siteInfoPackage from "@brains/site-info";
import { socialMediaPlugin } from "@brains/social-media";
import { stockPhotoPlugin } from "@brains/stock-photo";
import styleGuidePackage from "@brains/style-guide";
import askContentPackage from "@brains/ask-content";
import { topicsPlugin } from "@brains/topics";
import knowledgeMapPackage from "@brains/knowledge-map";
import { unifiedInboxPlugin } from "@brains/unified-inbox";
import { actionBoardPlugin } from "@brains/action-board";
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
 * A capability whose package is a declarative definition. The canonical brain
 * imports its members directly rather than resolving installed packages, so
 * it names each definition's package itself; packages release in lockstep
 * with the CLI, so they share its version. A converted first-party package
 * keeps the plugin id its class had, and with it the template, data source,
 * job and channel names brains, sites and queued jobs already use.
 */
function packageCapability(
  id: string,
  packageName: string,
  definition: PluginPackageDefinition,
  options: PluginPackageInstantiationOptions = {},
  /** The config the catalog gives the capability, as its class entry did. */
  defaults: CapabilityConfig = undefined,
): CapabilityEntry {
  const metadata = { name: packageName, version: packageJson.version };
  return [
    id,
    (config): Plugin[] =>
      instantiatePluginPackageDefinition(definition, config, metadata, options),
    defaults,
  ];
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
    ["playbook", playbookPlugin, undefined],
    ["playbooks", playbooksPlugin, undefined],
    packageCapability("onboarding", "@brains/onboarding", onboardingPackage, {
      pluginId: "onboarding",
      dependencies: ["playbook", "playbooks"],
    }),
    ["studio", studioPlugin, undefined],
    ["dashboard", dashboardPlugin, undefined],
    ["admin", adminPlugin, undefined],

    packageCapability("site-info", "@brains/site-info", siteInfoPackage, {
      pluginId: "site-metadata",
    }),
    ["site-content", siteContentPlugin, undefined],
    ["site-builder", siteBuilderPlugin, undefined],
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
    ["social-media", socialMediaPlugin, undefined],
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
    ["unified-inbox", unifiedInboxPlugin, undefined],
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
    [
      "mcp",
      MCPInterface,
      (env): PluginConfig => ({
        ...(env["MCP_AUTH_TOKEN"] ? { authToken: env["MCP_AUTH_TOKEN"] } : {}),
      }),
    ],
    ["email", EmailInterface, (): PluginConfig => ({})],
    ["webserver", WebserverInterface, (): PluginConfig => ({})],
    ["web-chat", WebChatInterface, (): PluginConfig => ({})],
    [
      "chat",
      ChatInterface,
      (env): PluginConfig => chatConfigFromEnv(env, { captureUrls: true }),
    ],
    ["a2a", A2AInterface, (): PluginConfig => ({})],
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
