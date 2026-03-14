import {
  defineBrain,
  type BrainEnvironment,
  type PluginConfig,
} from "@brains/app";
import { systemPlugin } from "@brains/system";
import { imagePlugin } from "@brains/image-plugin";
import { MCPInterface } from "@brains/mcp";
import { MatrixInterface } from "@brains/matrix";
import { DiscordInterface } from "@brains/discord";
import { WebserverInterface } from "@brains/webserver";
import { A2AInterface } from "@brains/a2a";
import { directorySync } from "@brains/directory-sync";
import { gitSyncPlugin } from "@brains/git-sync";
import { siteBuilderPlugin } from "@brains/site-builder-plugin";
import { blogPlugin } from "@brains/blog";
import { decksPlugin } from "@brains/decks";
import { notePlugin } from "@brains/note";
import { linkPlugin } from "@brains/link";
import { portfolioPlugin } from "@brains/portfolio";
import { topicsPlugin } from "@brains/topics";
import { socialMediaPlugin } from "@brains/social-media";
import { contentPipelinePlugin } from "@brains/content-pipeline";
import { analyticsPlugin } from "@brains/analytics";
import { dashboardPlugin } from "@brains/dashboard";
import { createNewsletterPlugin } from "@brains/newsletter";
import { obsidianVaultPlugin } from "@brains/obsidian-vault";
import { wishlistPlugin } from "@brains/wishlist";
import {
  professionalSitePlugin,
  ProfessionalLayout,
  routes,
} from "@brains/layout-professional";
import { MinimalLayout } from "@brains/default-site-content";
import yeehaaTheme from "@brains/theme-brutalist";
import { join } from "path";

const entityRouteConfig = {
  post: { label: "Essay" },
  deck: { label: "Presentation" },
  project: { label: "Project" },
  series: {
    label: "Series",
    navigation: { slot: "secondary" },
  },
  topic: {
    label: "Topic",
    navigation: { slot: "secondary" },
  },
  link: {
    label: "Link",
    navigation: { slot: "secondary" },
  },
  base: {
    label: "Note",
    navigation: { show: false },
  },
  "social-post": {
    label: "Social Post",
    pluralName: "social-posts",
    navigation: { slot: "secondary" },
  },
  newsletter: {
    label: "Newsletter",
    navigation: { slot: "secondary" },
  },
} as const;

/**
 * Rover Brain Model
 *
 * A personal knowledge management brain for independent professionals.
 * Manages blog posts, presentations, portfolio projects, social media,
 * newsletters, and a professional website.
 *
 * Identity is defined in seed-content/ (brain-character, site-info,
 * anchor-profile) — editable at runtime, single source of truth.
 *
 * Instance-specific config (homeserver, userId, repo, domain,
 * discord token, analytics tags) goes in brain.yaml.
 * Only secrets (tokens, API keys) come from .env.
 */
export default defineBrain({
  name: "rover",
  version: "1.0.0",

  capabilities: [
    [systemPlugin, {}],
    [imagePlugin, undefined],
    [dashboardPlugin, undefined],
    [blogPlugin, {}],
    [decksPlugin, undefined],
    [notePlugin, {}],
    [linkPlugin, {}],
    [portfolioPlugin, {}],
    [topicsPlugin, { includeEntityTypes: ["post", "deck", "project", "link"] }],
    [
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
      socialMediaPlugin,
      (env: BrainEnvironment): PluginConfig => ({
        linkedin: { accessToken: env["LINKEDIN_ACCESS_TOKEN"] },
        autoGenerateOnBlogPublish: true,
      }),
    ],
    [
      createNewsletterPlugin,
      (env: BrainEnvironment): PluginConfig => ({
        buttondown: {
          apiKey: env["BUTTONDOWN_API_KEY"] ?? "",
          doubleOptIn: true,
        },
      }),
    ],
    [obsidianVaultPlugin, { autoSync: true }],
    [wishlistPlugin, {}],
    [
      directorySync,
      {
        seedContent: true,
        seedContentPath: join(import.meta.dir, "..", "seed-content"),
        initialSync: true,
      },
    ],
    [
      gitSyncPlugin,
      (env: BrainEnvironment): PluginConfig => ({
        authToken: env["GIT_SYNC_TOKEN"],
        autoSync: true,
        autoPush: true,
        syncInterval: 5,
      }),
    ],
    [
      analyticsPlugin,
      (env: BrainEnvironment): PluginConfig => ({
        cloudflare: {
          accountId: env["CLOUDFLARE_ACCOUNT_ID"] ?? "",
          apiToken: env["CLOUDFLARE_API_TOKEN"] ?? "",
          siteTag: env["CLOUDFLARE_ANALYTICS_SITE_TAG"] ?? "",
        },
      }),
    ],
    [professionalSitePlugin, { entityRouteConfig }],
    [
      siteBuilderPlugin,
      {
        routes,
        entityRouteConfig,
        layouts: {
          default: ProfessionalLayout,
          minimal: MinimalLayout,
        },
        themeCSS: yeehaaTheme,
        cms: {},
      },
    ],
  ],

  interfaces: [
    [
      MCPInterface,
      (env: BrainEnvironment): PluginConfig => ({
        authToken: env["MCP_AUTH_TOKEN"],
      }),
    ],
    [
      MatrixInterface,
      (env: BrainEnvironment): PluginConfig | null =>
        env["MATRIX_ACCESS_TOKEN"]
          ? { accessToken: env["MATRIX_ACCESS_TOKEN"] }
          : null,
    ],
    [
      DiscordInterface,
      (env: BrainEnvironment): PluginConfig | null =>
        env["DISCORD_BOT_TOKEN"]
          ? { botToken: env["DISCORD_BOT_TOKEN"] }
          : null,
    ],
    [WebserverInterface, (): PluginConfig => ({})],
    [A2AInterface, (): PluginConfig => ({})],
  ],

  permissions: {
    rules: [
      { pattern: "cli:*", level: "anchor" },
      { pattern: "mcp:stdio", level: "anchor" },
      { pattern: "mcp:http", level: "public" },
      { pattern: "matrix:*", level: "public" },
      { pattern: "discord:*", level: "public" },
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
