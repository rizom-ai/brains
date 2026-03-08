import { defineBrain, type BrainEnvironment } from "@brains/app";
import { systemPlugin } from "@brains/system";
import { MCPInterface } from "@brains/mcp";
import { MatrixInterface } from "@brains/matrix";
import { directorySync } from "@brains/directory-sync";
import { gitSyncPlugin } from "@brains/git-sync";
import { join } from "path";
import { WebserverInterface } from "@brains/webserver";
import { siteBuilderPlugin } from "@brains/site-builder-plugin";
import { siteContentPlugin } from "@brains/site-content";
import {
  templates,
  routes,
  DefaultLayout,
  MinimalLayout,
  CTAFooterLayout,
} from "@brains/default-site-content";
import { topicsPlugin } from "@brains/topics";
import { linkPlugin } from "@brains/link";
import { summaryPlugin } from "@brains/summary";
import { decksPlugin } from "@brains/decks";
import defaultTheme from "@brains/theme-default";

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

  capabilities: [
    [systemPlugin, {}],
    [topicsPlugin, {}],
    [summaryPlugin, {}],
    [linkPlugin, {}],
    [decksPlugin, undefined],
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
      (env: BrainEnvironment) => ({
        authToken: env["GIT_SYNC_TOKEN"],
        autoSync: true,
        autoPush: true,
      }),
    ],
    [siteContentPlugin, undefined],
    [
      siteBuilderPlugin,
      {
        templates,
        routes,
        layouts: {
          default: DefaultLayout,
          minimal: MinimalLayout,
          "cta-footer": CTAFooterLayout,
        },
        themeCSS: defaultTheme,
      },
    ],
  ],

  interfaces: [
    [
      MCPInterface,
      (env: BrainEnvironment) => ({ authToken: env["MCP_AUTH_TOKEN"] }),
    ],
    [
      MatrixInterface,
      (env: BrainEnvironment) => ({
        accessToken: env["MATRIX_ACCESS_TOKEN"] ?? "",
        // homeserver, userId, deviceDisplayName: set in brain.yaml
      }),
    ],
    [WebserverInterface, () => ({})],
  ],

  permissions: {
    // Anchor/trusted users are instance-specific — set in brain.yaml
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
    // domain: set in brain.yaml
  },
});
