#!/usr/bin/env bun
import { defineConfig, handleCLI } from "@brains/app";
import { SystemPlugin } from "@brains/system";
import { MCPInterface } from "@brains/mcp";
import { MatrixInterface } from "@brains/matrix";
import { directorySync } from "@brains/directory-sync";
import { WebserverInterface } from "@brains/webserver";
import { siteBuilderPlugin } from "@brains/site-builder-plugin";
import { templates, routes, DefaultLayout } from "@brains/default-site-content";
import { TopicsPlugin } from "@brains/topics";
import { LinkPlugin } from "@brains/link";
import { SummaryPlugin } from "@brains/summary";
import defaultTheme, { customizeTheme } from "@brains/theme-default";
import customThemeCSS from "./theme.css" with { type: "text" };

// Use test-brain's custom green/teal theme
// const themeCSS = customizeTheme(defaultTheme, customThemeCSS);
const themeCSS = ""

const config = defineConfig({
  name: "test-brain",
  version: "1.0.0",
  aiApiKey: process.env["ANTHROPIC_API_KEY"],

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
    new MCPInterface({}),
    new MatrixInterface({
      homeserver: process.env["MATRIX_HOMESERVER"] || "https://matrix.rizom.ai",
      accessToken: process.env["MATRIX_ACCESS_TOKEN"] || "",
      userId: process.env["MATRIX_USER_ID"] || "@testbrain-dev:rizom.ai",
    }),
    directorySync({}),
    new WebserverInterface({}),
    siteBuilderPlugin({
      templates,
      routes,
      layouts: {
        default: DefaultLayout,
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
