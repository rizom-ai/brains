#!/usr/bin/env bun
import { defineConfig, handleCLI } from "@brains/app";
import { SystemPlugin } from "@brains/system";
import { MatrixInterface } from "@brains/matrix";
import { MCPInterface } from "@brains/mcp";
import { WebserverInterface } from "@brains/webserver";
import { directorySync } from "@brains/directory-sync";
import { GitSyncPlugin } from "@brains/git-sync";
import { notePlugin } from "@brains/note";
import { socialMediaPlugin } from "@brains/social-media";
import { siteBuilderPlugin } from "@brains/site-builder-plugin";
import { productsPlugin } from "@brains/products";
import { routes as defaultRoutes } from "@brains/default-site-content";

// Customize routes for Rizom collective
const routes = defaultRoutes.map((route) => {
  if (route.id === "home") {
    return {
      ...route,
      layout: "cta-footer", // Use CTA footer layout
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
  name: "collective-brain",
  version: "0.1.0",
  aiApiKey: process.env["ANTHROPIC_API_KEY"],

  // Deployment configuration
  deployment: {
    domain: "rizom.ai",
    cdn: {
      enabled: true,
      provider: "bunny",
    },
  },

  // Configure centralized permissions
  permissions: {
    anchors: ["matrix:@yeehaa:rizom.ai"],
    rules: [
      // MCP stdio transport gets anchor permissions (local access)
      { pattern: "mcp:stdio", level: "anchor" },
      // MCP http transport gets public permissions (remote access)
      { pattern: "mcp:http", level: "public" },
      // Matrix gets public permissions (chat access)
      { pattern: "matrix:*", level: "public" },
    ],
  },

  plugins: [
    new SystemPlugin({}),
    new MCPInterface({}),
    new MatrixInterface({
      homeserver: process.env["MATRIX_HOMESERVER"] || "https://matrix.rizom.ai",
      accessToken: process.env["MATRIX_ACCESS_TOKEN"] || "",
      userId: process.env["MATRIX_USER_ID"] || "@ranger-local:rizom.ai",
    }),
    notePlugin({}),
    socialMediaPlugin({
      linkedin: {
        accessToken: process.env["LINKEDIN_ACCESS_TOKEN"],
        organizationId: process.env["LINKEDIN_ORGANIZATION_ID"],
      },
    }),
    directorySync(),
    new GitSyncPlugin({
      gitUrl: process.env["GIT_SYNC_URL"] || "",
      authToken: process.env["GIT_SYNC_TOKEN"],
      authorName: "Rizom",
      authorEmail: "collective@rizom.ai",
      autoPush: true,
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
    productsPlugin(),
    siteBuilderPlugin({
      routes, // Custom routes with Rizom branding
      previewOutputDir: "./dist/site-preview", // Build to preview by default
      entityRouteConfig: {
        "social-post": {
          label: "Social Post",
          navigation: {
            show: true,
            slot: "secondary",
            priority: 40,
          },
        },
      },
    }),
  ],
});

// If this file is run directly, handle CLI and run the app
if (import.meta.main) {
  handleCLI(config);
}

export default config;
