import { defineBrain, type PluginConfig } from "@brains/app";
// System tools are now framework-level (registered by shell, not a plugin)
import { MCPInterface } from "@brains/mcp";
import { MatrixInterface } from "@brains/matrix";
import { directorySync } from "@brains/directory-sync";

import { join } from "path";
import { WebserverInterface } from "@brains/webserver";
import { siteBuilderPlugin } from "@brains/site-builder-plugin";
import { siteContentPlugin } from "@brains/site-content";
import { topicsPlugin } from "@brains/topics";
import { linkPlugin } from "@brains/link";
import { summaryPlugin } from "@brains/summary";
import { decksPlugin } from "@brains/decks";
import rangerSite from "@brains/site-ranger";

/**
 * Relay Brain Model
 *
 * A collaborative knowledge management brain for teams.
 * Captures, organizes, and shares knowledge through topics,
 * summaries, decks, and links.
 *
 * Identity is defined in seed-content/ (brain-character, site-info,
 * anchor-profile) — editable at runtime, single source of truth.
 *
 * Instance-specific config (homeserver, userId, repo, domain) goes
 * in brain.yaml. Only secrets (tokens, API keys) come from .env.
 */
export default defineBrain({
  name: "relay",
  version: "1.0.0",
  site: rangerSite,
  presets: {
    default: [
      "topics",
      "summary",
      "link",
      "decks",
      "site-content",
      "site-builder",
      "directory-sync",
      "mcp",
      "matrix",
      "webserver",
    ],
  },

  capabilities: [
    ["topics", topicsPlugin, {}],
    ["summary", summaryPlugin, {}],
    ["link", linkPlugin, {}],
    ["decks", decksPlugin, undefined],
    [
      "directory-sync",
      directorySync,
      {
        seedContent: true,
        seedContentPath: join(import.meta.dir, "..", "seed-content"),
        initialSync: true,
        git: {
          authorName: "Relay",
          authorEmail: "relay@rizom.ai",
        },
      },
    ],
    ["site-content", siteContentPlugin, undefined],
    ["site-builder", siteBuilderPlugin, {}],
  ],

  interfaces: [
    ["mcp", MCPInterface, (): PluginConfig => ({})],
    ["matrix", MatrixInterface, (): PluginConfig => ({})],
    ["webserver", WebserverInterface, (): PluginConfig => ({})],
  ],

  permissions: {
    rules: [
      { pattern: "cli:*", level: "anchor" },
      { pattern: "mcp:stdio", level: "anchor" },
      { pattern: "mcp:http", level: "anchor" },
    ],
  },

  deployment: {
    cdn: {
      enabled: true,
      provider: "bunny",
    },
  },
});
