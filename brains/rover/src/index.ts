import { defineBrain, type PluginConfig } from "@brains/app";
// System tools are now framework-level (registered by shell, not a plugin)
import { imagePlugin } from "@brains/image-plugin";
import { MCPInterface } from "@brains/mcp";
import { DiscordInterface } from "@brains/discord";
import { ChatInterface } from "@brains/chat";
import { WebserverInterface } from "@brains/webserver";
import { WebChatInterface } from "@brains/web-chat";
import { A2AInterface } from "@brains/a2a";
import { authServicePlugin } from "@brains/auth-service";
import { directorySync } from "@brains/directory-sync";
import { emailResendPlugin } from "@brains/email-resend";
import { siteBuilderPlugin } from "@brains/site-builder-plugin";
import { siteInfoPlugin } from "@brains/site-info";
import { blogPlugin } from "@brains/blog";
import { seriesPlugin } from "@brains/series";
import { decksPlugin } from "@brains/decks";
import { documentPlugin } from "@brains/document-plugin";
import { notePlugin } from "@brains/note";
import { linkPlugin } from "@brains/link";
import { portfolioPlugin } from "@brains/portfolio";
import { topicsPlugin } from "@brains/topics";
import { socialMediaPlugin } from "@brains/social-media";
import { contentPipelinePlugin } from "@brains/content-pipeline";
import { analyticsPlugin } from "@brains/analytics";
import { cmsPlugin } from "@brains/cms";
import { dashboardPlugin } from "@brains/dashboard";
import { newsletter } from "@brains/newsletter";
import { obsidianVaultPlugin } from "@brains/obsidian-vault";
import { notificationsPlugin } from "@brains/notifications";
import { playbookPlugin } from "@brains/playbook";
import { playbooksPlugin } from "@brains/playbooks";
import { roverOnboardingPlugin } from "@brains/rover-onboarding";
import { wishlistPlugin } from "@brains/wishlist";
import { promptPlugin } from "@brains/prompt";
import { stockPhotoPlugin } from "@brains/stock-photo";
import { rizomEcosystemPlugin } from "@brains/rizom-ecosystem";
import { agentDiscovery } from "@brains/agent-discovery";
import { assessment } from "@brains/assessment";
import { atprotoPlugin } from "@brains/atproto";
import { roverProfilePlugin } from "./profile-extension";
import defaultSite from "@brains/site-default";
import defaultTheme from "@brains/theme-default";
import { join } from "path";
import packageJson from "../package.json" with { type: "json" };

/**
 * Rover Brain Model
 *
 * A personal knowledge management brain for independent professionals.
 * Manages blog posts, presentations, portfolio projects, social media,
 * newsletters, and a professional website.
 *
 * Identity is defined in preset-scoped seed-content-* directories (brain-character, site-info,
 * anchor-profile) — editable at runtime, single source of truth.
 *
 * Instance-specific config (homeserver, userId, repo, domain,
 * discord token, analytics tags) goes in brain.yaml.
 * Only secrets (tokens, API keys) come from .env.
 */
const core = [
  "prompt",
  "rover-profile",
  "image",
  "document",
  "note",
  "link",
  "wishlist",
  "topics",
  "directory-sync",
  "atproto",
  "agents",
  "assessment",
  "auth-service",
  "notifications",
  "playbook",
  "playbooks",
  "rover-onboarding",
  "email-resend",
  "cms",
  "dashboard-root",
  "mcp",
  "webserver",
  "web-chat",
  "discord",
  "a2a",
];

const web = [
  ...core.filter((id) => id !== "dashboard-root"),
  "dashboard",
  "blog",
  "series",
  "decks",
  "analytics",
  "obsidian-vault",
  "site-info",
  "site-builder",
];

const full = [
  ...web,
  "portfolio",
  "topics",
  "content-pipeline",
  "social-media",
  "newsletter",
  "stock-photo",
];

const agentInstructions = [
  `Rover is a personal professional knowledge and publishing brain for an independent professional. Prioritize personal knowledge management, professional website content, essays, projects, decks, newsletters, and social distribution workflows.`,
  `When a user asks for a publishing/content overview, use the available publishing entity types directly instead of treating the request as generic team memory.`,
  `Draft blog posts are only post entities with status draft. If the user asks whether draft blog posts exist, call only system_list for entityType post with status draft; do not also list social-post, newsletter, deck, or other draft entity types. After telling the user there are no draft blog posts, treat follow-ups like "make one draft" or "make one a draft" as requests to change an existing published post back to draft: ask which existing published post they want changed; do not offer to create a brand-new post and do not call system_generate to create a fresh draft from that ambiguous follow-up.`,
];

export default defineBrain({
  name: "rover",
  version: packageJson.version,
  model: "gpt-5.4-mini",
  site: defaultSite,
  theme: defaultTheme,
  presets: {
    core,
    default: web,
    full,
  },

  evalDisable: [
    "discord",
    "chat",
    "webserver",
    "web-chat",
    "mcp",
    "atproto",
    "analytics",
    "dashboard",
    "dashboard-root",
    "email-resend",
  ],

  agentInstructions,

  capabilities: [
    ["prompt", promptPlugin, undefined],
    ["rover-profile", roverProfilePlugin, {}],
    ["image", imagePlugin, undefined],
    [
      "cms",
      cmsPlugin,
      (env): PluginConfig => ({
        ...(env["CMS_CONTENT_REPO_PAT"]
          ? {
              passkeyLogin: {
                contentRepoToken: env["CMS_CONTENT_REPO_PAT"],
              },
            }
          : {}),
      }),
    ],
    ["auth-service", authServicePlugin, undefined],
    ["notifications", notificationsPlugin, undefined],
    ["playbook", playbookPlugin, {}],
    ["playbooks", playbooksPlugin, {}],
    ["rover-onboarding", roverOnboardingPlugin, {}],
    ["email-resend", emailResendPlugin, undefined],
    ["dashboard", dashboardPlugin, undefined],
    ["dashboard-root", dashboardPlugin, { routePath: "/" }],
    ["blog", blogPlugin, {}],
    ["series", seriesPlugin, undefined],
    ["decks", decksPlugin, undefined],
    ["document", documentPlugin, undefined],
    ["note", notePlugin, {}],
    ["link", linkPlugin, {}],
    ["portfolio", portfolioPlugin, {}],
    [
      "topics",
      topicsPlugin,
      {
        includeEntityTypes: [
          "post",
          "deck",
          "project",
          "link",
          "anchor-profile",
        ],
      },
    ],
    [
      "content-pipeline",
      contentPipelinePlugin,
      {
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
    ],
    [
      "social-media",
      socialMediaPlugin,
      {
        autoGenerateOnBlogPublish: true,
      },
    ],
    ["newsletter", newsletter, { doubleOptIn: true }],
    ["obsidian-vault", obsidianVaultPlugin, { autoSync: true }],
    ["wishlist", wishlistPlugin, {}],
    ["stock-photo", stockPhotoPlugin, {}],
    ["agents", agentDiscovery, undefined],
    ["assessment", assessment, undefined],
    [
      "atproto",
      atprotoPlugin,
      (env): PluginConfig => ({
        ...(env["ATPROTO_APP_PASSWORD"]
          ? { appPassword: env["ATPROTO_APP_PASSWORD"] }
          : {}),
      }),
    ],
    [
      "directory-sync",
      directorySync,
      (): PluginConfig => ({
        seedContent: true,
        seedContentPath: join(import.meta.dir, "..", "seed-content-core"),
        initialSync: true,
      }),
    ],
    ["analytics", analyticsPlugin, {}],
    ["rizom-ecosystem", rizomEcosystemPlugin, undefined],
    ["site-info", siteInfoPlugin, undefined],
    [
      "site-builder",
      siteBuilderPlugin,
      {
        cms: {},
      },
    ],
  ],

  interfaces: [
    ["mcp", MCPInterface, (): PluginConfig => ({})],
    ["discord", DiscordInterface, (): PluginConfig => ({})],
    ["chat", ChatInterface, (): PluginConfig => ({})],
    ["webserver", WebserverInterface, (): PluginConfig => ({})],
    ["web-chat", WebChatInterface, (): PluginConfig => ({})],
    ["a2a", A2AInterface, (): PluginConfig => ({})],
  ],

  permissions: {
    rules: [
      { pattern: "cli:*", level: "anchor" },
      { pattern: "mcp:stdio", level: "anchor" },
      { pattern: "mcp:http", level: "public" },
      { pattern: "discord:*", level: "public" },
      { pattern: "web-chat:*", level: "anchor" },
    ],
    entityActions: {
      "*": {
        create: "anchor",
        update: "anchor",
        delete: "anchor",
        extract: "anchor",
      },
    },
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
