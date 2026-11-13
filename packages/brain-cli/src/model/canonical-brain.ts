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
import {
  agentDiscoveryCompositeConfigSchema,
  agentDiscoveryPackage,
  agentToolsPackage,
  derivedSkillPackage,
  skillPackage,
} from "@brains/agent-discovery";
import analyticsPackage from "@brains/analytics";
import {
  assessmentConfigSchema,
  derivedSwotPackage,
  swotPackage,
} from "@brains/assessment";
import atprotoPackage from "@brains/atproto";
import atprotoRegistryPackage from "@brains/atproto-registry";
import { authServicePlugin } from "@brains/auth-service";
import blogPackage from "@brains/blog";
import chatInterface, { chatConfigFromEnv } from "@brains/chat";
import studioPackage from "@brains/studio";
import contentPipelinePackage from "@brains/content-pipeline";
import contactPackage, { CONTACT_DEPENDENCIES } from "@brains/contact";
import formPackage from "@brains/form";
import quizPackage, { QUIZ_DEPENDENCIES } from "@brains/quiz";
import conversationMemoryPackage from "@brains/conversation-memory";
import faqPackage from "@brains/faq";
import dashboardPackage from "@brains/dashboard";
import decksPackage from "@brains/decks";
import directorySyncPackage from "@brains/directory-sync";
import docsPackage from "@brains/doc";
import guidesPackage from "@brains/guide";
import bookPackage from "@brains/book";
import documentPackage from "@brains/document-plugin";
import emailInterface from "@brains/email";
import emailWorkflowsPackage from "@brains/email-workflows";
import imagePackage from "@brains/image-plugin";
import linkPackage from "@brains/link";
import mcpInterface from "@brains/mcp";
import { selectNewsletterPackages } from "@brains/newsletter";
import notePackage from "@brains/note";
import notificationsPackage from "@brains/notifications";
import { linkedInImportPlugin } from "@brains/linkedin-import";
import { createLinkedInBrokerProvider } from "@brains/linkedin-import/broker-provider";
import { createOAuthBrokerPackage } from "@brains/oauth-broker";
import obsidianVaultPackage from "@brains/obsidian-vault";
import playbooksPackage from "@brains/playbooks";
import portfolioPackage from "@brains/portfolio";
import profilePackage from "@brains/profile";
import promptPackage from "@brains/prompt";
import onboardingPackage from "@brains/onboarding";
import seriesPackage from "@brains/series";
import siteBuilderPackage from "@brains/site-builder-plugin";
import siteContentPackage from "@brains/site-content";
import siteInfoPackage from "@brains/site-info";
import socialMediaPackage from "@brains/social-media";
import stockPhotoPackage from "@brains/stock-photo";
import styleGuidePackage from "@brains/style-guide";
import askContentPackage from "@brains/ask-content";
import topicsPackage from "@brains/topics";
import knowledgeMapPackage from "@brains/knowledge-map";
import unifiedInboxPackage from "@brains/unified-inbox";
import { actionBoardPackage } from "@brains/action-board";
import webChatInterface from "@brains/web-chat";
import wishlistPackage from "@brains/wishlist";
import { CANONICAL_CHAT_MODEL } from "./canonical-model";
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

/**
 * The newsletter capability: the newsletter entity under newsletter, and
 * the delivery provider its config selects under the id its class had,
 * buttondown or resend.
 */
function newsletterPlugins(config: PluginConfig): Plugin[] {
  const { entity, provider } = selectNewsletterPackages(config);
  const metadata = {
    name: "@brains/newsletter",
    version: packageJson.version,
  };
  return [
    ...instantiatePluginPackageDefinition(
      entity.definition,
      entity.config,
      metadata,
      { pluginId: "newsletter" },
    ),
    ...(provider
      ? instantiatePluginPackageDefinition(
          provider.definition,
          provider.config,
          metadata,
          { pluginId: provider.kind },
        )
      : []),
  ];
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
  model: CANONICAL_CHAT_MODEL,
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
        // Under the id its class had, which registered the topic type
        // inside itself: the type installs as itself.
        ...instantiatePluginPackageDefinition(
          topicsPackage,
          config,
          { name: "@brains/topics", version: packageJson.version },
          { pluginId: "topics" },
        ),
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
    packageCapability(
      "directory-sync",
      "@brains/directory-sync",
      directorySyncPackage,
      { pluginId: "directory-sync" },
      {
        seedContent: true,
        seedContentPath: "./seed-content",
        initialSync: true,
      },
    ),
    packageCapability(
      "atproto-registry",
      "@brains/atproto-registry",
      atprotoRegistryPackage,
      { pluginId: "atproto-registry" },
    ),
    // The agent directory, as its three classes were: the agent type's
    // agent-discovery, the agent tools service and the skill type, each
    // under its class's id, its type installed apart. Skill derivation on
    // or off picks the skill type with or without its rule.
    [
      "agents",
      (config): Plugin[] => {
        const { enableSkillDerivation, notifyOnNewAgents } =
          agentDiscoveryCompositeConfigSchema.parse(config);
        const metadata = {
          name: "@brains/agent-discovery",
          version: packageJson.version,
        };
        return [
          ...instantiatePluginPackageDefinition(
            agentDiscoveryPackage,
            {},
            metadata,
            { pluginId: "agent-discovery", ownedTypePluginId: "agent-entity" },
          ),
          ...instantiatePluginPackageDefinition(
            agentToolsPackage,
            { notifyOnNewAgents },
            metadata,
            { pluginId: "agent" },
          ),
          ...instantiatePluginPackageDefinition(
            enableSkillDerivation ? derivedSkillPackage : skillPackage,
            {},
            metadata,
            { pluginId: "skill", ownedTypePluginId: "skill-entity" },
          ),
        ];
      },
      undefined,
    ],
    // The SWOT, under the id its class had. Derivation on or off picks the
    // swot type with or without its rule.
    [
      "assessment",
      (config): Plugin[] =>
        instantiatePluginPackageDefinition(
          assessmentConfigSchema.parse(config).enableSwotDerivation
            ? derivedSwotPackage
            : swotPackage,
          {},
          { name: "@brains/assessment", version: packageJson.version },
          { pluginId: "swot" },
        ),
      undefined,
    ],
    ["auth-service", authServicePlugin, undefined],
    packageCapability(
      "notifications",
      "@brains/notifications",
      notificationsPackage,
      { pluginId: "notifications" },
    ),
    packageCapability("contact", "@brains/contact", contactPackage, {
      // Under the id its class had, after what its class depended on; its
      // contact-request type installs as itself.
      pluginId: "contact",
      dependencies: CONTACT_DEPENDENCIES,
    }),
    packageCapability("quiz", "@brains/quiz", quizPackage, {
      pluginId: "quiz",
      dependencies: QUIZ_DEPENDENCIES,
    }),
    // The playbooks service owns the playbook type: one capability installs
    // both plugins, playbook and playbooks, as the two capabilities did.
    packageCapability("playbooks", "@brains/playbooks", playbooksPackage, {
      pluginId: "playbooks",
    }),
    packageCapability("onboarding", "@brains/onboarding", onboardingPackage, {
      pluginId: "onboarding",
      dependencies: ["playbook", "playbooks"],
    }),
    // Under the id its class had; its grouping-definitions type installs
    // as itself.
    packageCapability("studio", "@brains/studio", studioPackage, {
      pluginId: "studio",
    }),
    packageCapability("dashboard", "@brains/dashboard", dashboardPackage, {
      pluginId: "dashboard",
    }),
    packageCapability("admin", "@brains/admin", adminPackage, {
      pluginId: "admin",
    }),

    packageCapability("site-info", "@brains/site-info", siteInfoPackage, {
      pluginId: "site-metadata",
    }),
    packageCapability(
      "site-content",
      "@brains/site-content",
      siteContentPackage,
      // Under the id its class had; its type installs apart.
      { pluginId: "site-content", ownedTypePluginId: "site-content-entity" },
    ),
    packageCapability(
      "site-builder",
      "@brains/site-builder-plugin",
      siteBuilderPackage,
      { pluginId: "site-builder" },
    ),
    packageCapability("form", "@brains/form", formPackage, {
      pluginId: "form",
    }),
    packageCapability("analytics", "@brains/analytics", analyticsPackage, {
      // Under the id its class had; its traffic-snapshot type installs as
      // itself.
      pluginId: "analytics",
    }),

    packageCapability("blog", "@brains/blog", blogPackage, {
      pluginId: "blog",
    }),
    packageCapability("series", "@brains/series", seriesPackage, {
      pluginId: "series",
    }),
    packageCapability("portfolio", "@brains/portfolio", portfolioPackage, {
      pluginId: "portfolio",
    }),
    packageCapability(
      "content-pipeline",
      "@brains/content-pipeline",
      contentPipelinePackage,
      { pluginId: "content-pipeline" },
    ),
    packageCapability(
      "social-media",
      "@brains/social-media",
      socialMediaPackage,
      { pluginId: "social-media" },
    ),
    ["newsletter", newsletterPlugins, undefined],
    packageCapability("stock-photo", "@brains/stock-photo", stockPhotoPackage, {
      pluginId: "stock-photo",
    }),
    [
      "atproto",
      packagePlugins("@brains/atproto", atprotoPackage, {
        pluginId: "atproto",
      }),
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
      {
        // Under the id its class had, which registered summary, decision
        // and action-item inside itself: each type installs as itself.
        pluginId: "conversation-memory",
      },
    ),
    packageCapability(
      "action-board",
      "@brains/action-board",
      actionBoardPackage,
      {
        pluginId: "action-board",
      },
    ),
    packageCapability("faq", "@brains/faq", faqPackage, {
      // Under the id its class had, which registered the faq type inside
      // itself: the type installs apart.
      pluginId: "faq",
      ownedTypePluginId: "faq-entity",
    }),
    packageCapability("docs", "@brains/doc", docsPackage, {
      pluginId: "docs",
    }),
    packageCapability("guides", "@brains/guide", guidesPackage, {
      pluginId: "guides",
    }),
    packageCapability("book", "@brains/book", bookPackage, {
      // Under the id its class had, which registered book and book-section
      // inside itself: book-section installs as itself, book apart.
      pluginId: "book",
      ownedTypePluginId: "book-entity",
    }),

    packageCapability(
      "obsidian-vault",
      "@brains/obsidian-vault",
      obsidianVaultPackage,
      { pluginId: "obsidian-vault" },
      { autoSync: true },
    ),
    packageCapability(
      "email-workflows",
      "@brains/email-workflows",
      emailWorkflowsPackage,
      // Under the id its class had; its mail-item type installs as itself.
      { pluginId: "email-workflows" },
    ),
    packageCapability(
      "unified-inbox",
      "@brains/unified-inbox",
      unifiedInboxPackage,
      { pluginId: "unified-inbox" },
    ),
    ["linkedin-import", linkedInImportPlugin, undefined],
    packageCapability(
      "oauth-broker",
      "@brains/oauth-broker",
      createOAuthBrokerPackage({
        providers: { linkedin: createLinkedInBrokerProvider },
      }),
      { pluginId: "oauth-broker" },
    ),
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
