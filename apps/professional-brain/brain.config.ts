#!/usr/bin/env bun
import { defineConfig, handleCLI } from "@brains/app";
import { SystemPlugin } from "@brains/system";
import { MCPInterface } from "@brains/mcp";
import { MatrixInterface } from "@brains/matrix";
import { WebserverInterface } from "@brains/webserver";
import { directorySync } from "@brains/directory-sync";
import { GitSyncPlugin } from "@brains/git-sync";
import { siteBuilderPlugin } from "@brains/site-builder-plugin";
import { blogPlugin } from "@brains/blog";
import { decksPlugin } from "@brains/decks";
import { notePlugin } from "@brains/note";
import { linkPlugin } from "@brains/link";
import { portfolioPlugin } from "@brains/portfolio";
import TopicsPlugin from "@brains/topics";
import { socialMediaPlugin } from "@brains/social-media";
import { publishPipelinePlugin } from "@brains/publish-pipeline";
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
  project: { label: "Project" }, // Portfolio case studies
  series: {
    label: "Series",
    navigation: { slot: "secondary" }, // Show in footer only
  },
  topic: {
    label: "Topic",
    navigation: { slot: "secondary" }, // Show in footer only
  },
  link: {
    label: "Link",
    navigation: { slot: "secondary" }, // Show in footer only
  },
  note: {
    label: "Note",
    navigation: { show: false }, // Notes are personal, hide from navigation
  },
  "social-post": {
    label: "Social Post",
    pluralName: "social-posts",
    navigation: { slot: "secondary" }, // Show in footer only
  },
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
    dns: {
      enabled: true,
      provider: "bunny",
    },
  },

  permissions: {
    anchors: ["matrix:@yeehaa:rizom.ai"],
    rules: [
      // MCP stdio transport gets anchor permissions (local access)
      { pattern: "mcp:stdio", level: "anchor" },
      // MCP http transport gets public permissions (remote access)
      // Change to "anchor" if you want full access over HTTP (requires auth token)
      { pattern: "mcp:http", level: "public" },
      // Matrix interface: anchor users get full access, others get public
      { pattern: "matrix:*", level: "public" },
    ],
  },

  plugins: [
    new SystemPlugin({}),
    new MCPInterface({}),
    new MatrixInterface({
      homeserver: process.env["MATRIX_HOMESERVER"] || "https://matrix.rizom.ai",
      accessToken: process.env["MATRIX_ACCESS_TOKEN"] || "",
      userId: process.env["MATRIX_USER_ID"] || "@yeehaa-brain-bot:rizom.ai",
    }),
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
    publishPipelinePlugin({}),
    blogPlugin({}),
    decksPlugin({}),
    notePlugin({}),
    linkPlugin({}),
    portfolioPlugin({}),
    new TopicsPlugin({}),
    socialMediaPlugin({}),
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
