import { defineBrain, type PluginConfig } from "@brains/app";
// System tools are now framework-level (registered by shell, not a plugin)
import { MCPInterface } from "@brains/mcp";
import { DiscordInterface } from "@brains/discord";
import { WebserverInterface } from "@brains/webserver";
import { directorySync } from "@brains/directory-sync";

import { notePlugin } from "@brains/note";
import { linkPlugin } from "@brains/link";
import { socialMediaPlugin } from "@brains/social-media";
import { siteBuilderPlugin } from "@brains/site-builder-plugin";
import { siteContentPlugin } from "@brains/site-content";
import { siteInfoPlugin } from "@brains/site-info";
import { analyticsPlugin } from "@brains/analytics";
import { productsPlugin } from "@brains/products";
import { wishlistPlugin } from "@brains/wishlist";
import { promptPlugin } from "@brains/prompt";
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
  version: "0.1.0",
  site: rangerSite,
  presets: {
    default: [
      "prompt",
      "dashboard",
      "note",
      "link",
      "social-media",
      "products",
      "wishlist",
      "analytics",
      "directory-sync",
      "site-info",
      "site-content",
      "site-builder",
      "mcp",
      "discord",
      "webserver",
    ],
  },

  evalDisable: ["discord", "webserver", "analytics", "dashboard"],

  capabilities: [
    ["prompt", promptPlugin, undefined],
    ["dashboard", dashboardPlugin, undefined],
    ["note", notePlugin, {}],
    ["link", linkPlugin, {}],
    ["social-media", socialMediaPlugin, {}],
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
    ["analytics", analyticsPlugin, {}],
    ["site-info", siteInfoPlugin, undefined],
    ["site-content", siteContentPlugin, undefined],
    ["site-builder", siteBuilderPlugin, {}],
  ],

  interfaces: [
    ["mcp", MCPInterface, (): PluginConfig => ({})],
    ["discord", DiscordInterface, (): PluginConfig => ({ captureUrls: true })],
    ["webserver", WebserverInterface, (): PluginConfig => ({})],
  ],

  permissions: {
    rules: [
      { pattern: "cli:*", level: "anchor" },
      { pattern: "mcp:stdio", level: "anchor" },
      { pattern: "mcp:http", level: "public" },
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
