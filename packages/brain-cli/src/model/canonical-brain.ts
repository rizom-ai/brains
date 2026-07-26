import {
  defineBrain,
  defineBundle,
  type BrainDefinition,
  type CapabilityBundleDefinition,
  type PluginConfig,
} from "@brains/app";
import { A2AInterface } from "@brains/a2a";
import { accountPlugin, adminPlugin } from "@brains/admin";
import { agentDiscovery } from "@brains/agent-discovery";
import { analyticsPlugin } from "@brains/analytics";
import { assessment } from "@brains/assessment";
import { atprotoPlugin } from "@brains/atproto";
import { atprotoRegistryPlugin } from "@brains/atproto-registry";
import { authServicePlugin } from "@brains/auth-service";
import { blogPlugin } from "@brains/blog";
import { ChatInterface } from "@brains/chat";
import { cmsPlugin } from "@brains/cms";
import { contentPipelinePlugin } from "@brains/content-pipeline";
import { conversationMemoryPlugin } from "@brains/conversation-memory";
import { dashboardPlugin } from "@brains/dashboard";
import { decksPlugin } from "@brains/decks";
import { directorySync } from "@brains/directory-sync";
import { DiscordInterface } from "@brains/discord";
import { docsPlugin } from "@brains/doc";
import { documentPlugin } from "@brains/document-plugin";
import { emailResendPlugin } from "@brains/email-resend";
import { imagePlugin } from "@brains/image-plugin";
import { linkPlugin } from "@brains/link";
import { MCPInterface } from "@brains/mcp";
import { newsletter } from "@brains/newsletter";
import { notePlugin } from "@brains/note";
import { notificationsPlugin } from "@brains/notifications";
import { obsidianVaultPlugin } from "@brains/obsidian-vault";
import { playbookPlugin, playbooksPlugin } from "@brains/playbooks";
import { portfolioPlugin } from "@brains/portfolio";
import { productsPlugin } from "@brains/products";
import { profilePlugin } from "@brains/profile";
import { promptPlugin } from "@brains/prompt";
import { rizomEcosystemPlugin } from "@brains/rizom-ecosystem";
import { roverOnboardingPlugin } from "@brains/rover-onboarding";
import { seriesPlugin } from "@brains/series";
import { siteBuilderPlugin } from "@brains/site-builder-plugin";
import { siteContentPlugin } from "@brains/site-content";
import { siteInfoPlugin } from "@brains/site-info";
import { socialMediaPlugin } from "@brains/social-media";
import { stockPhotoPlugin } from "@brains/stock-photo";
import { styleGuidePlugin } from "@brains/style-guide";
import { topicsPlugin } from "@brains/topics";
import { WebChatInterface } from "@brains/web-chat";
import { WebserverInterface } from "@brains/webserver";
import { wishlistPlugin } from "@brains/wishlist";
import packageJson from "../../package.json" with { type: "json" };

export const CORE_BUNDLE_ID = "core";
export const SITE_BUNDLE_ID = "site";
export const PUBLISHING_BUNDLE_ID = "publishing";

export const coreBundle: CapabilityBundleDefinition = defineBundle({
  id: CORE_BUNDLE_ID,
  members: [
    "prompt",
    "profile",
    "style-guide",
    "image",
    "document",
    "note",
    "link",
    "wishlist",
    "topics",
    "decks",
    "directory-sync",
    "atproto-registry",
    "agents",
    "assessment",
    "auth-service",
    "account",
    "notifications",
    "playbook",
    "playbooks",
    "onboarding",
    "email-resend",
    "cms",
    "dashboard",
    "admin",
    "mcp",
    "webserver",
    "web-chat",
    "discord",
    "a2a",
  ],
  config: [
    {
      member: "dashboard",
      value: { routePath: "/" },
    },
  ],
  permissions: [
    {
      member: "admin",
      config: {
        rules: [{ pattern: "cli:*", level: "admin" }],
      },
    },
    {
      member: "mcp",
      config: {
        rules: [
          { pattern: "mcp:stdio", level: "admin" },
          { pattern: "mcp:http", level: "public" },
        ],
      },
    },
    {
      member: "discord",
      config: {
        rules: [{ pattern: "discord:*", level: "public" }],
      },
    },
    {
      member: "web-chat",
      config: {
        rules: [{ pattern: "web-chat:*", level: "admin" }],
      },
    },
  ],
  evalDisable: [
    "dashboard",
    "email-resend",
    "mcp",
    "webserver",
    "web-chat",
    "discord",
  ],
});

export const siteBundle: CapabilityBundleDefinition = defineBundle({
  id: SITE_BUNDLE_ID,
  members: [
    "dashboard",
    "site-info",
    "site-content",
    "site-builder",
    "analytics",
  ],
  config: [
    {
      member: "dashboard",
      value: { routePath: "/dashboard" },
      overrides: CORE_BUNDLE_ID,
    },
  ],
  evalDisable: ["dashboard", "analytics"],
});

export const publishingBundle: CapabilityBundleDefinition = defineBundle({
  id: PUBLISHING_BUNDLE_ID,
  members: [
    "blog",
    "series",
    "portfolio",
    "content-pipeline",
    "social-media",
    "newsletter",
    "stock-photo",
    "atproto",
  ],
  config: [
    {
      member: "content-pipeline",
      value: {
        generationSchedules: {
          newsletter: "0 9 * * 1",
          "social-post": "0 10 * * *",
        },
        generationConditions: {
          newsletter: {
            skipIfDraftExists: true,
            minSourceEntities: 1,
            sourceEntityType: "post",
          },
          "social-post": {
            skipIfDraftExists: true,
            maxUnpublishedDrafts: 5,
          },
        },
      },
    },
    {
      member: "social-media",
      value: { autoGenerateOnBlogPublish: true },
    },
    {
      member: "newsletter",
      value: { doubleOptIn: true },
    },
  ],
  agentInstructions: [
    `Use the installed publishing capabilities for professional website content, essays, projects, decks, newsletters, and social distribution workflows. Treat publishing requests as production and distribution work rather than generic shared-memory capture.`,
    `When answering questions like "what have I written about X" or "which posts relate to this deck/source", search first and use semantic search results as candidates, not proof. Summarize only clearly relevant entities whose title or content directly matches the asked topic or has substantial overlap with the source's main themes; omit weak/tangential candidates rather than presenting them as definite matches. A match based on only an isolated shared term or pattern is not enough; when one candidate is clearly stronger than the rest, list only the strongest clear match and say the others were tangential rather than naming them as matches.`,
    `Draft blog posts are only post entities with status draft. If the user asks whether draft blog posts exist, call only system_list for entityType post with status draft; do not also list social-post, newsletter, deck, or other draft entity types. After telling the user there are no draft blog posts, treat follow-ups like "make one draft" or "make one a draft" as requests to change an existing published post back to draft: ask which existing published post they want changed; do not offer to create a brand-new post and do not call system_generate to create a fresh draft from that ambiguous follow-up.`,
  ],
  evalDisable: ["atproto"],
});

/**
 * Canonical catalog for the one-brain bundle model.
 *
 * Existing Rover, Relay, and Ranger definitions remain the production inputs
 * until the repository and fleet cross over together. This definition is built
 * and characterized in parallel; it does not contain legacy capability aliases.
 */
export const canonicalBrain: BrainDefinition = defineBrain({
  name: "brain",
  version: packageJson.version,
  model: "gpt-5.6-luna",
  reasoningEffort: "low",
  capabilities: [
    ["prompt", promptPlugin, undefined],
    ["profile", profilePlugin, {}],
    ["style-guide", styleGuidePlugin, undefined],
    ["image", imagePlugin, undefined],
    ["document", documentPlugin, undefined],
    ["note", notePlugin, {}],
    ["link", linkPlugin, {}],
    ["wishlist", wishlistPlugin, {}],
    ["topics", topicsPlugin, {}],
    ["decks", decksPlugin, undefined],
    [
      "directory-sync",
      directorySync,
      {
        seedContent: true,
        seedContentPath: "./seed-content",
        initialSync: true,
      },
    ],
    ["atproto-registry", atprotoRegistryPlugin, {}],
    ["agents", agentDiscovery, undefined],
    ["assessment", assessment, undefined],
    ["auth-service", authServicePlugin, undefined],
    ["account", accountPlugin, undefined],
    ["notifications", notificationsPlugin, undefined],
    ["playbook", playbookPlugin, {}],
    ["playbooks", playbooksPlugin, {}],
    ["onboarding", roverOnboardingPlugin, {}],
    ["email-resend", emailResendPlugin, undefined],
    ["cms", cmsPlugin, {}],
    ["dashboard", dashboardPlugin, {}],
    ["admin", adminPlugin, undefined],

    ["site-info", siteInfoPlugin, undefined],
    ["site-content", siteContentPlugin, undefined],
    ["site-builder", siteBuilderPlugin, {}],
    ["analytics", analyticsPlugin, {}],

    ["blog", blogPlugin, {}],
    ["series", seriesPlugin, undefined],
    ["portfolio", portfolioPlugin, {}],
    ["content-pipeline", contentPipelinePlugin, {}],
    ["social-media", socialMediaPlugin, {}],
    ["newsletter", newsletter, {}],
    ["stock-photo", stockPhotoPlugin, {}],
    [
      "atproto",
      atprotoPlugin,
      (env): PluginConfig => ({
        ...(env["ATPROTO_APP_PASSWORD"]
          ? { appPassword: env["ATPROTO_APP_PASSWORD"] }
          : {}),
      }),
    ],

    ["conversation-memory", conversationMemoryPlugin, {}],
    ["docs", docsPlugin, undefined],

    ["products", productsPlugin, undefined],
    ["obsidian-vault", obsidianVaultPlugin, { autoSync: true }],
    ["rizom-ecosystem", rizomEcosystemPlugin, undefined],
  ],
  interfaces: [
    ["mcp", MCPInterface, (): PluginConfig => ({})],
    ["webserver", WebserverInterface, (): PluginConfig => ({})],
    ["web-chat", WebChatInterface, (): PluginConfig => ({})],
    ["discord", DiscordInterface, (): PluginConfig => ({})],
    ["a2a", A2AInterface, (): PluginConfig => ({})],
    ["chat", ChatInterface, (): PluginConfig => ({})],
  ],
  bundles: [coreBundle, siteBundle, publishingBundle],
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
