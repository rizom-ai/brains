#!/usr/bin/env bun
import { defineConfig, handleCLI } from "@brains/app";
import { SystemPlugin } from "@brains/system";
import { MCPInterface } from "@brains/mcp";
import { MatrixInterface } from "@brains/matrix";
import { directorySync } from "@brains/directory-sync";
import { GitSyncPlugin } from "@brains/git-sync";
import { WebserverInterface } from "@brains/webserver";
import { siteBuilderPlugin } from "@brains/site-builder-plugin";
import {
  templates,
  routes,
  DefaultLayout,
  MinimalLayout,
} from "@brains/default-site-content";
import { TopicsPlugin } from "@brains/topics";
import { LinkPlugin } from "@brains/link";
import { SummaryPlugin } from "@brains/summary";
import { DecksPlugin } from "@brains/decks";
import defaultTheme, { customizeTheme } from "@brains/theme-default";
import customThemeCSS from "./theme.css" with { type: "text" };

// Use team-brain's custom theme
const themeCSS = customizeTheme(defaultTheme, customThemeCSS);

const config = defineConfig({
  name: "team-brain",
  version: "1.0.0",
  aiApiKey: process.env["ANTHROPIC_API_KEY"],

  // Define team-brain's identity
  identity: {
    name: "Marco",
    role: "Team knowledge coordinator",
    purpose:
      "Maintain team documentation, track decisions, and facilitate knowledge sharing across the organization",
    values: ["collaboration", "transparency", "accessibility", "actionability"],
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
    new SystemPlugin({}),
    new TopicsPlugin({}),
    new SummaryPlugin({}),
    new LinkPlugin({}),
    new DecksPlugin(),
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
    new GitSyncPlugin({
      gitUrl:
        process.env["GIT_SYNC_URL"] ||
        "https://github.com/username/recall-backup",
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
    siteBuilderPlugin({
      templates,
      routes,
      layouts: {
        default: DefaultLayout,
        minimal: MinimalLayout,
      },
      siteConfig: {
        title: "Recall",
        description: "Your team's AI-powered knowledge hub",
      },
      themeCSS,
    }),
  ],
});

// If this file is run directly, handle CLI and run the app
if (import.meta.main) {
  handleCLI(config);
}

export default config;
