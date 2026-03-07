#!/usr/bin/env bun
import { defineConfig, handleCLI } from "@brains/app";
import { systemPlugin } from "@brains/system";
import { MatrixInterface } from "@brains/matrix";
import { MCPInterface } from "@brains/mcp";
import { DiscordInterface } from "@brains/discord";
import { WebserverInterface } from "@brains/webserver";
import { directorySync } from "@brains/directory-sync";
import { gitSyncPlugin } from "@brains/git-sync";
import { notePlugin } from "@brains/note";
import { linkPlugin } from "@brains/link";
import { socialMediaPlugin } from "@brains/social-media";
import { siteBuilderPlugin } from "@brains/site-builder-plugin";
import { analyticsPlugin } from "@brains/analytics";
import { productsPlugin } from "@brains/products";
import { wishlistPlugin } from "@brains/wishlist";
import { dashboardPlugin } from "@brains/dashboard";
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
        show: false, // Don't show home in navigation
        slot: route.navigation?.slot ?? "primary",
        priority: route.navigation?.priority ?? 50,
        label: route.navigation?.label,
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

// Shared config values used by multiple plugins
const domain = "rizom.ai";
const productionDomain = process.env["DOMAIN"]
  ? `https://${process.env["DOMAIN"]}`
  : undefined;
const previewDomain = process.env["PREVIEW_DOMAIN"]
  ? `https://${process.env["PREVIEW_DOMAIN"]}`
  : undefined;
const gitRepo = process.env["GIT_SYNC_REPO"];

const config = defineConfig({
  name: "collective-brain",
  version: "0.1.0",
  aiApiKey: process.env["ANTHROPIC_API_KEY"],

  // Deployment configuration
  deployment: {
    domain,
    cdn: {
      enabled: true,
      provider: "bunny",
    },
  },

  // Configure centralized permissions
  permissions: {
    anchors: ["matrix:@yeehaa:rizom.ai", "discord:1442828818493735015"],
    trusted: ["discord:624315360157499422"],
    rules: [
      // MCP stdio transport gets anchor permissions (local access)
      { pattern: "mcp:stdio", level: "anchor" },
      // MCP http transport gets public permissions (remote access)
      { pattern: "mcp:http", level: "public" },
      // Matrix gets public permissions (chat access)
      { pattern: "matrix:*", level: "public" },
      // Discord interface: default public
      { pattern: "discord:*", level: "public" },
    ],
  },

  plugins: [
    systemPlugin({}),
    dashboardPlugin(),
    new MCPInterface({
      domain: process.env["DOMAIN"] ?? domain,
    }),
    new MatrixInterface({
      homeserver:
        process.env["MATRIX_HOMESERVER"] || `https://matrix.${domain}`,
      accessToken: process.env["MATRIX_ACCESS_TOKEN"] || "",
      userId: process.env["MATRIX_USER_ID"] || `@ranger-local:${domain}`,
    }),
    new DiscordInterface({
      botToken: process.env["DISCORD_BOT_TOKEN"] || "",
      captureUrls: true,
    }),
    notePlugin({}),
    linkPlugin({}),
    socialMediaPlugin({
      linkedin: {
        accessToken: process.env["LINKEDIN_ACCESS_TOKEN"],
        organizationId: process.env["LINKEDIN_ORGANIZATION_ID"],
      },
    }),
    directorySync(),
    gitSyncPlugin({
      repo: gitRepo,
      authToken: process.env["GIT_SYNC_TOKEN"],
      authorName: "Rizom",
      authorEmail: `collective@${domain}`,
      autoPush: true,
    }),
    new WebserverInterface({
      productionDomain,
      previewDomain,
      previewDistDir: "./dist/site-preview",
      previewPort: 4321,
    }),
    productsPlugin(),
    wishlistPlugin({}),
    analyticsPlugin({
      cloudflare: {
        accountId: process.env["CLOUDFLARE_ACCOUNT_ID"] || "",
        apiToken: process.env["CLOUDFLARE_API_TOKEN"] || "",
        siteTag: process.env["CLOUDFLARE_ANALYTICS_SITE_TAG"] || "",
      },
    }),
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
        link: {
          label: "Link",
          navigation: {
            slot: "secondary",
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
