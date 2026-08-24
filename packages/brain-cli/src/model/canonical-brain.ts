import {
  defineBrain,
  type BrainDefinition,
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
import { ChatInterface, chatConfigFromEnv } from "@brains/chat";
import { cmsPlugin } from "@brains/cms";
import { contentPipelinePlugin } from "@brains/content-pipeline";
import { conversationMemoryPlugin } from "@brains/conversation-memory";
import { dashboardPlugin } from "@brains/dashboard";
import { decksPlugin } from "@brains/decks";
import { directorySync } from "@brains/directory-sync";
import { docsPlugin } from "@brains/doc";
import { documentPlugin } from "@brains/document-plugin";
import { EmailInterface } from "@brains/email";
import { emailWorkflows } from "@brains/email-workflows";
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
import { onboardingPlugin } from "@brains/onboarding";
import { seriesPlugin } from "@brains/series";
import { siteBuilderPlugin } from "@brains/site-builder-plugin";
import { siteContentPlugin } from "@brains/site-content";
import { siteInfoPlugin } from "@brains/site-info";
import { socialMediaPlugin } from "@brains/social-media";
import { stockPhotoPlugin } from "@brains/stock-photo";
import { styleGuidePlugin } from "@brains/style-guide";
import { topicsPlugin } from "@brains/topics";
import { unifiedInboxPlugin } from "@brains/unified-inbox";
import { WebChatInterface } from "@brains/web-chat";
import { WebserverInterface } from "@brains/webserver";
import { wishlistPlugin } from "@brains/wishlist";
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

/** Canonical catalog and active capability-bundle taxonomy. */
export const canonicalBrain: BrainDefinition = defineBrain({
  name: "brain",
  version: packageJson.version,
  bundleContract: CANONICAL_BUNDLE_CONTRACT,
  model: "gpt-5.6-luna",
  reasoningEffort: "low",
  capabilities: [
    ["prompt", promptPlugin, undefined],
    ["profile", profilePlugin, undefined],
    ["style-guide", styleGuidePlugin, undefined],
    ["image", imagePlugin, undefined],
    ["document", documentPlugin, undefined],
    ["note", notePlugin, undefined],
    ["link", linkPlugin, undefined],
    ["wishlist", wishlistPlugin, undefined],
    ["topics", topicsPlugin, undefined],
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
    ["atproto-registry", atprotoRegistryPlugin, undefined],
    ["agents", agentDiscovery, undefined],
    ["assessment", assessment, undefined],
    ["auth-service", authServicePlugin, undefined],
    ["account", accountPlugin, undefined],
    ["notifications", notificationsPlugin, undefined],
    ["playbook", playbookPlugin, undefined],
    ["playbooks", playbooksPlugin, undefined],
    ["onboarding", onboardingPlugin, undefined],
    ["cms", cmsPlugin, undefined],
    ["dashboard", dashboardPlugin, undefined],
    ["admin", adminPlugin, undefined],

    ["site-info", siteInfoPlugin, undefined],
    ["site-content", siteContentPlugin, undefined],
    ["site-builder", siteBuilderPlugin, undefined],
    ["analytics", analyticsPlugin, undefined],

    ["blog", blogPlugin, undefined],
    ["series", seriesPlugin, undefined],
    ["portfolio", portfolioPlugin, undefined],
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
    ["docs", docsPlugin, undefined],

    ["products", productsPlugin, undefined],
    ["obsidian-vault", obsidianVaultPlugin, { autoSync: true }],
    ["email-workflows", emailWorkflows, undefined],
    ["unified-inbox", unifiedInboxPlugin, undefined],
  ],
  interfaces: [
    ["mcp", MCPInterface, (): PluginConfig => ({})],
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
