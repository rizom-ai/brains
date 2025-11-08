#!/usr/bin/env bun
import { defineConfig, handleCLI } from "@brains/app";
import { SystemPlugin } from "@brains/system";
import { MCPInterface } from "@brains/mcp";
import { WebserverInterface } from "@brains/webserver";
import { directorySync } from "@brains/directory-sync";
import { siteBuilderPlugin } from "@brains/site-builder-plugin";
import { blogPlugin } from "@brains/blog";
import {
  routes as defaultRoutes,
  DefaultLayout,
  MinimalLayout,
} from "@brains/default-site-content";
import defaultTheme from "@brains/theme-default";

// Define routes for Yeehaa
const routes = [
  {
    id: "home",
    path: "/",
    title: "Yeehaa",
    description: "Personal knowledge base and blog",
    layout: "default",
    navigation: { show: true, label: "Home", slot: "secondary", priority: 10 },
    sections: [
      {
        id: "homepage",
        template: "blog:homepage",
        dataQuery: {},
      },
    ],
  },
  {
    id: "about",
    path: "/about",
    title: "About Yeehaa",
    description: "Learn more about Yeehaa and this knowledge base",
    layout: "default",
    navigation: { show: true, label: "About", slot: "secondary", priority: 90 },
    sections: [
      {
        id: "about",
        template: "about",
        dataQuery: { entityType: "base", query: { id: "README" } },
      },
    ],
  },
];

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
      layouts: {
        default: DefaultLayout,
        minimal: MinimalLayout,
      },
      themeCSS: defaultTheme,
    }),
  ],
});

if (import.meta.main) {
  handleCLI(config);
}

export default config;
