import {
  defineBrain,
  type BrainEnvironment,
  type PluginConfig,
} from "@brains/app";
import { systemPlugin } from "@brains/system";
import { MCPInterface } from "@brains/mcp";
import { MatrixInterface } from "@brains/matrix";
import { DiscordInterface } from "@brains/discord";
import { WebserverInterface } from "@brains/webserver";
import { directorySync } from "@brains/directory-sync";
import { gitSyncPlugin } from "@brains/git-sync";
import { notePlugin } from "@brains/note";
import { linkPlugin } from "@brains/link";
import { socialMediaPlugin } from "@brains/social-media";
import { siteBuilderPlugin } from "@brains/site-builder-plugin";
import { analyticsPlugin } from "@brains/analytics";
import { productsPlugin } from "@brains/products";
import { wishlistPlugin } from "@brains/wishlist";
import { dashboardPlugin } from "@brains/dashboard";
import { join } from "path";
import rangerSite from "@brains/site-ranger";

/**
 * Ranger Brain Model
 *
 * A community-facing brain for collectives and organizations.
 * Manages notes, links, social media, products, and wishlists
 * with a public website featuring CTA-driven landing pages.
 *
 * Identity is defined in seed-content/ (brain-character, site-info,
 * anchor-profile) — editable at runtime, single source of truth.
 *
 * Instance-specific config (homeserver, userId, repo, domain,
 * discord token, analytics tags) goes in brain.yaml.
 * Only secrets (tokens, API keys) come from .env.
 */
export default defineBrain({
  name: "ranger",
  version: "1.0.0",
  site: rangerSite,
  presets: {
    default: [
      "system",
      "dashboard",
      "note",
      "link",
      "social-media",
      "products",
      "wishlist",
      "analytics",
      "directory-sync",
      "git-sync",
      "site-builder",
      "mcp",
      "matrix",
      "discord",
      "webserver",
    ],
  },

  capabilities: [
    ["system", systemPlugin, {}],
    ["dashboard", dashboardPlugin, undefined],
    ["note", notePlugin, {}],
    ["link", linkPlugin, {}],
    [
      "social-media",
      socialMediaPlugin,
      (env: BrainEnvironment): PluginConfig => ({
        linkedin: {
          accessToken: env["LINKEDIN_ACCESS_TOKEN"],
          organizationId: env["LINKEDIN_ORGANIZATION_ID"],
        },
      }),
    ],
    ["products", productsPlugin, undefined],
    ["wishlist", wishlistPlugin, {}],
    [
      "directory-sync",
      directorySync,
      {
        seedContent: true,
        seedContentPath: join(import.meta.dir, "..", "seed-content"),
        initialSync: true,
      },
    ],
    [
      "git-sync",
      gitSyncPlugin,
      (env: BrainEnvironment): PluginConfig => ({
        authToken: env["GIT_SYNC_TOKEN"],
        autoSync: true,
        autoPush: true,
      }),
    ],
    [
      "analytics",
      analyticsPlugin,
      (env: BrainEnvironment): PluginConfig => ({
        cloudflare: {
          accountId: env["CLOUDFLARE_ACCOUNT_ID"] ?? "",
          apiToken: env["CLOUDFLARE_API_TOKEN"] ?? "",
          siteTag: env["CLOUDFLARE_ANALYTICS_SITE_TAG"] ?? "",
        },
      }),
    ],
    ["site-builder", siteBuilderPlugin, {}],
  ],

  interfaces: [
    [
      "mcp",
      MCPInterface,
      (env: BrainEnvironment): PluginConfig => ({
        authToken: env["MCP_AUTH_TOKEN"],
      }),
    ],
    [
      "matrix",
      MatrixInterface,
      (env: BrainEnvironment): PluginConfig | null =>
        env["MATRIX_ACCESS_TOKEN"]
          ? { accessToken: env["MATRIX_ACCESS_TOKEN"] }
          : null,
    ],
    [
      "discord",
      DiscordInterface,
      (env: BrainEnvironment): PluginConfig | null =>
        env["DISCORD_BOT_TOKEN"]
          ? { botToken: env["DISCORD_BOT_TOKEN"], captureUrls: true }
          : null,
    ],
    ["webserver", WebserverInterface, (): PluginConfig => ({})],
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
  },
});
