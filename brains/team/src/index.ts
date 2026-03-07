import { defineBrain, type BrainEnvironment } from "@brains/app";
import { systemPlugin } from "@brains/system";
import { MCPInterface } from "@brains/mcp";
import { MatrixInterface } from "@brains/matrix";
import { directorySync } from "@brains/directory-sync";
import { gitSyncPlugin } from "@brains/git-sync";
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
 * Team Brain Model
 *
 * A collaborative knowledge management brain for team use.
 * Focused on knowledge capture, summarization, and sharing.
 *
 * Non-secret config uses static defaults here. Instance-specific
 * overrides (homeserver URLs, user IDs, repos, domains) go in
 * brain.yaml's `plugins:` section. Only actual secrets (tokens,
 * API keys) are wired from env.
 */
export default defineBrain({
  name: "team-brain",
  version: "1.0.0",

  identity: {
    characterName: "Recall",
    role: "Team knowledge coordinator",
    purpose: "Capture, organize, and share team knowledge",
    values: ["clarity", "collaboration", "accessibility"],
  },

  capabilities: [
    [systemPlugin, {}],
    [topicsPlugin, {}],
    [summaryPlugin, {}],
    [linkPlugin, {}],
    [decksPlugin, undefined],
    [directorySync, { seedContent: true, initialSync: true }],
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
        homeserver: "https://matrix.rizom.ai",
        accessToken: env["MATRIX_ACCESS_TOKEN"] ?? "",
        userId: "@teambot-dev:rizom.ai",
        deviceDisplayName: "Recall",
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
    domain: "recall.rizom.ai",
    cdn: {
      enabled: true,
      provider: "bunny",
    },
  },
});
