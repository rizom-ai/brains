#!/usr/bin/env bun
import { defineConfig, handleCLI } from "@brains/app";
import { SystemPlugin } from "@brains/system";
import { MCPInterface } from "@brains/mcp";
import { WebserverInterface } from "@brains/webserver";
import { directorySync } from "@brains/directory-sync";
import { GitSyncPlugin } from "@brains/git-sync";
import { siteBuilderPlugin } from "@brains/site-builder-plugin";
import { blogPlugin } from "@brains/blog";
import { decksPlugin } from "@brains/decks";
import {
  professionalSitePlugin,
  ProfessionalLayout,
  routes,
} from "@brains/professional-site";
import { MinimalLayout } from "@brains/default-site-content";
import yeehaaTheme from "@brains/theme-yeehaa";

// Entity route configuration
const entityRouteConfig = {
  post: { label: "Essay" }, // pluralName defaults to 'essays'
  deck: { label: "Presentation" }, // pluralName defaults to 'presentations'
};

const config = defineConfig({
  name: "professional-brain",
  version: "0.1.0",
  aiApiKey: process.env["ANTHROPIC_API_KEY"],

  // Deployment configuration (most values use sensible defaults)
  deployment: {
    domain: "yeehaa.io",
    cdn: {
      enabled: true,
      provider: "bunny",
    },
  },

  permissions: {
    anchors: [],
    rules: [
      // MCP stdio transport gets anchor permissions (local access)
      { pattern: "mcp:stdio", level: "anchor" },
      // MCP http transport gets public permissions (remote access)
      // Change to "anchor" if you want full access over HTTP (requires auth token)
      { pattern: "mcp:http", level: "public" },
    ],
  },

  plugins: [
    new SystemPlugin({}),
    new MCPInterface({}),
    directorySync(),
    new GitSyncPlugin({
      gitUrl: process.env["GIT_SYNC_URL"] || "",
      authToken: process.env["GIT_SYNC_TOKEN"],
      authorName: "Yeehaa",
      authorEmail: "yeehaa@rizom.ai",
    }),
    new WebserverInterface({
      previewPort: 4321,
      previewDistDir: "./dist/site-preview",
    }),
    blogPlugin({}),
    decksPlugin({}),
    professionalSitePlugin({
      entityRouteConfig,
    }),
    siteBuilderPlugin({
      routes, // Custom routes with Yeehaa branding
      entityRouteConfig,
      layouts: {
        default: ProfessionalLayout,
        minimal: MinimalLayout,
      },
      themeCSS: yeehaaTheme,
      previewOutputDir: "./dist/site-preview",
      productionOutputDir: "./dist/site-production",
      previewUrl: process.env["PREVIEW_DOMAIN"],
      productionUrl: process.env["DOMAIN"],
    }),
  ],
});

if (import.meta.main) {
  handleCLI(config);
}

export default config;
