import { defineBrain, type PluginConfig } from "@brains/app";
// System tools are now framework-level (registered by shell, not a plugin)
import { imagePlugin } from "@brains/image-plugin";
import { MCPInterface } from "@brains/mcp";
import { MatrixInterface } from "@brains/matrix";
import { DiscordInterface } from "@brains/discord";
import { WebserverInterface } from "@brains/webserver";
import { A2AInterface } from "@brains/a2a";
import { directorySync } from "@brains/directory-sync";
import { siteBuilderPlugin } from "@brains/site-builder-plugin";
import { siteInfoPlugin } from "@brains/site-info";
import { blogPlugin } from "@brains/blog";
import { seriesPlugin } from "@brains/series";
import { decksPlugin } from "@brains/decks";
import { notePlugin } from "@brains/note";
import { linkPlugin } from "@brains/link";
import { portfolioPlugin } from "@brains/portfolio";
import { topicsPlugin } from "@brains/topics";
import { socialMediaPlugin } from "@brains/social-media";
import { contentPipelinePlugin } from "@brains/content-pipeline";
import { analyticsPlugin } from "@brains/analytics";
import { dashboardPlugin } from "@brains/dashboard";
import { newsletterPlugin } from "@brains/newsletter-entity";
import { buttondownPlugin } from "@brains/buttondown";
import { obsidianVaultPlugin } from "@brains/obsidian-vault";
import { wishlistPlugin } from "@brains/wishlist";
import { promptPlugin } from "@brains/prompt";
import defaultSite from "@brains/site-default";
import { join } from "path";

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
const minimal = [
  "prompt",
  "note",
  "link",
  "wishlist",
  "directory-sync",
  "mcp",
  "discord",
  "a2a",
];

const standard = [
  ...minimal,
  "image",
  "dashboard",
  "blog",
  "series",
  "decks",
  "analytics",
  "obsidian-vault",
  "site-info",
  "site-builder",
  "webserver",
];

const pro = [
  ...standard,
  "portfolio",
  "topics",
  "content-pipeline",
  "social-media",
  "newsletter",
  "buttondown",
  "matrix",
];

// Eval = all capabilities, no interfaces (no daemons/servers)
const evaluation = [
  "prompt",
  "image",
  "dashboard",
  "blog",
  "series",
  "decks",
  "note",
  "link",
  "wishlist",
  "portfolio",
  "topics",
  "content-pipeline",
  "social-media",
  "newsletter",
  "buttondown",
  "analytics",
  "obsidian-vault",
  "directory-sync",
  "site-info",
  "site-builder",
];

export default defineBrain({
  name: "rover",
  version: "1.0.0",
  site: defaultSite,
  presets: {
    minimal,
    default: standard,
    pro,
    eval: evaluation,
  },

  capabilities: [
    ["prompt", promptPlugin, undefined],
    ["image", imagePlugin, undefined],
    ["dashboard", dashboardPlugin, undefined],
    ["blog", blogPlugin, {}],
    ["series", seriesPlugin, undefined],
    ["decks", decksPlugin, undefined],
    ["note", notePlugin, {}],
    ["link", linkPlugin, {}],
    ["portfolio", portfolioPlugin, {}],
    [
      "topics",
      topicsPlugin,
      { includeEntityTypes: ["post", "deck", "project", "link"] },
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
    ["newsletter", newsletterPlugin, {}],
    ["buttondown", buttondownPlugin, { doubleOptIn: true }],
    ["obsidian-vault", obsidianVaultPlugin, { autoSync: true }],
    ["wishlist", wishlistPlugin, {}],
    [
      "directory-sync",
      directorySync,
      {
        seedContent: true,
        seedContentPath: join(import.meta.dir, "..", "seed-content"),
        initialSync: true,
        git: {
          authorName: "Rover",
          authorEmail: "rover@rizom.ai",
        },
      },
    ],
    ["analytics", analyticsPlugin, {}],
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
    ["matrix", MatrixInterface, (): PluginConfig => ({})],
    ["discord", DiscordInterface, (): PluginConfig => ({})],
    ["webserver", WebserverInterface, (): PluginConfig => ({})],
    ["a2a", A2AInterface, (): PluginConfig => ({})],
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
