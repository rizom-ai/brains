#!/usr/bin/env bun
import { defineConfig, handleCLI } from "@brains/app";
import { SystemPlugin } from "@brains/system";
import { MCPInterface } from "@brains/mcp";
import { WebserverInterface } from "@brains/webserver";
import { directorySync } from "@brains/directory-sync";
import { siteBuilderPlugin } from "@brains/site-builder-plugin";
import {
  templates,
  routes as defaultRoutes,
  DefaultLayout,
  MinimalLayout,
  NoFooterLayout,
} from "@brains/default-site-content";
import defaultTheme from "@brains/theme-default";

// Customize routes for Rizom collective
const routes = defaultRoutes.map((route) => {
  if (route.id === "home") {
    return {
      ...route,
      layout: "no-footer", // Use no-footer layout with custom CTA
      title: "Rizom Collective",
      description: "The Rizom collective's knowledge hub",
      navigation: {
        ...route.navigation,
        show: false, // Don't show home in navigation
      },
      sections: [
        {
          id: "main",
          template: "about",
          dataQuery: {
            entityType: "base",
            query: { id: "HOME" },
          },
        },
      ],
    };
  }
  if (route.id === "about") {
    return {
      ...route,
      title: "About",
      description: "About the Rizom collective and this brain",
    };
  }
  return route;
});

const config = defineConfig({
  name: "rizom",
  version: "0.1.0",
  aiApiKey: process.env["ANTHROPIC_API_KEY"],

  // Define Rizom collective's identity
  identity: {
    name: "Rizom",
    role: "Collective knowledge coordinator",
    purpose: "Share the vision, projects, and values of the Rizom collective",
    values: ["openness", "collaboration", "innovation", "community"],
  },

  // Configure centralized permissions
  permissions: {
    anchors: [],
    rules: [
      // MCP stdio transport gets anchor permissions (local access)
      { pattern: "mcp:stdio", level: "anchor" },
      // MCP http transport gets public permissions (remote access)
      { pattern: "mcp:http", level: "public" },
    ],
  },

  plugins: [
    new SystemPlugin({}),
    new MCPInterface({
      authToken: process.env["MCP_AUTH_TOKEN"],
    }),
    directorySync({
      seedContent: true, // Enable seed content for initial setup
      initialSync: true, // Export all entities on startup
    }),
    new WebserverInterface({
      productionDomain: process.env["DOMAIN"]
        ? `https://${process.env["DOMAIN"]}`
        : undefined,
      previewDomain: process.env["PREVIEW_DOMAIN"]
        ? `https://${process.env["PREVIEW_DOMAIN"]}`
        : undefined,
      previewDistDir: "./dist/site-preview",
      previewPort: 4321,
    }),
    siteBuilderPlugin({
      templates,
      routes,
      layouts: {
        default: DefaultLayout,
        minimal: MinimalLayout,
        "no-footer": NoFooterLayout,
      },
      previewOutputDir: "./dist/site-preview",
      siteInfo: {
        title: "Rizom",
        description: "The Rizom collective's knowledge hub",
        url: process.env["DOMAIN"]
          ? `https://${process.env["DOMAIN"]}`
          : undefined,
        themeMode: "dark",
        cta: {
          heading: "Unlock your full potential",
          buttonText: "Join Rizom",
          buttonLink: "https://www.linkedin.com/company/rizom-collective",
        },
      },
      themeCSS: defaultTheme,
    }),
  ],
});

// If this file is run directly, handle CLI and run the app
if (import.meta.main) {
  handleCLI(config);
}

export default config;
