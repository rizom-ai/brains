#!/usr/bin/env bun
import { defineConfig, handleCLI } from "@brains/app";
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

const config = defineConfig({
  name: "team-brain",
  version: "1.0.0",
  aiApiKey: process.env["ANTHROPIC_API_KEY"],

  // Deployment configuration
  deployment: {
    domain: "recall.rizom.ai",
    cdn: {
      enabled: true,
      provider: "bunny",
    },
  },

  // Configure centralized permissions
  permissions: {
    anchors: [
      // Matrix anchor user
      `matrix:${process.env["MATRIX_ANCHOR_USER_ID"] || "@yeehaa:rizom.ai"}`,
    ],
    rules: [
      // All CLI users are anchors (local access)
      { pattern: "cli:*", level: "anchor" },
      // MCP stdio transport gets anchor permissions (local access)
      { pattern: "mcp:stdio", level: "anchor" },
      // MCP http transport gets public permissions (remote access)
      { pattern: "mcp:http", level: "anchor" },
    ],
  },

  plugins: [
    systemPlugin({}),
    topicsPlugin({}),
    summaryPlugin({}),
    linkPlugin({}),
    decksPlugin(),
    new MCPInterface({
      authToken: process.env["MCP_AUTH_TOKEN"],
    }),
    new MatrixInterface({
      homeserver: process.env["MATRIX_HOMESERVER"] || "https://matrix.rizom.ai",
      accessToken: process.env["MATRIX_ACCESS_TOKEN"] || "",
      userId: process.env["MATRIX_USER_ID"] || "@teambrain-dev:rizom.ai",
      deviceDisplayName: "Recall",
    }),
    directorySync({
      seedContent: true, // Enable seed content for initial setup
      initialSync: true, // Export all entities on startup
    }),
    gitSyncPlugin({
      repo: process.env["GIT_SYNC_REPO"] || "username/recall-backup",
      authToken: process.env["GIT_SYNC_TOKEN"],
      authorName: "Recall",
      authorEmail: "yeehaa@rizom.ai",
      autoSync: true, // Periodically commit and push changes
      autoPush: true, // Automatically push commits to remote
    }),
    new WebserverInterface({
      productionDomain: process.env["DOMAIN"]
        ? `https://${process.env["DOMAIN"]}`
        : undefined,
    }),
    siteContentPlugin(),
    siteBuilderPlugin({
      templates,
      routes,
      layouts: {
        default: DefaultLayout,
        minimal: MinimalLayout,
        "cta-footer": CTAFooterLayout,
      },
      // siteInfo data comes from seed-content/site-info/site-info.md entity
      themeCSS: defaultTheme,
    }),
  ],
});

// If this file is run directly, handle CLI and run the app
if (import.meta.main) {
  handleCLI(config);
}

export default config;
