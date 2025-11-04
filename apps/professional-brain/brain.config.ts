#!/usr/bin/env bun
import { defineConfig, handleCLI } from "@brains/app";
import { SystemPlugin } from "@brains/system";
import { MCPInterface } from "@brains/mcp";
import { WebserverInterface } from "@brains/webserver";
import { directorySync } from "@brains/directory-sync";
import { siteBuilderPlugin } from "@brains/site-builder-plugin";
import { blogPlugin } from "@brains/blog";
import { routes as defaultRoutes } from "@brains/default-site-content";

// Customize routes for Yeehaa
const routes = defaultRoutes.map((route) => {
  if (route.id === "home") {
    return {
      ...route,
      title: "Yeehaa",
      description: "Latest blog post from my personal knowledge base",
      sections: [
        {
          id: "latest-post",
          template: "blog:post-detail",
          dataQuery: {
            entityType: "post",
            query: { latest: true },
          },
        },
      ],
    };
  }
  if (route.id === "about") {
    return {
      ...route,
      title: "About Yeehaa",
      description: "Learn more about Yeehaa and this knowledge base",
      // Keep default sections querying README
    };
  }
  return route;
});

const config = defineConfig({
  name: "professional",
  version: "0.1.0",
  aiApiKey: process.env["ANTHROPIC_API_KEY"],

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
    new WebserverInterface({
      previewPort: 4321,
      previewDistDir: "./dist/site-preview",
    }),
    blogPlugin({}),
    siteBuilderPlugin({
      routes, // Custom routes with Yeehaa branding
    }),
  ],
});

if (import.meta.main) {
  handleCLI(config);
}

export default config;
