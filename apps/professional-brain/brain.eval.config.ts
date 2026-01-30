#!/usr/bin/env bun
/**
 * Eval-specific brain config
 * Excludes git-sync to prevent syncing with real remote during evaluations
 */
import { defineConfig } from "@brains/app";
import { SystemPlugin } from "@brains/system";
import { MCPInterface } from "@brains/mcp";
import { WebserverInterface } from "@brains/webserver";
import { directorySync } from "@brains/directory-sync";
import { siteBuilderPlugin } from "@brains/site-builder-plugin";
import { blogPlugin } from "@brains/blog";
import { decksPlugin } from "@brains/decks";
import TopicsPlugin from "@brains/topics";
import { NotePlugin } from "@brains/note";
import { LinkPlugin } from "@brains/link";
import { PortfolioPlugin } from "@brains/portfolio";
import { SocialMediaPlugin } from "@brains/social-media";
import { createNewsletterPlugin } from "@brains/newsletter";
import {
  professionalSitePlugin,
  ProfessionalLayout,
  routes,
} from "@brains/professional-site";
import { MinimalLayout } from "@brains/default-site-content";
import yeehaaTheme from "@brains/theme-yeehaa";

// Entity route configuration (same as main config)
const entityRouteConfig = {
  post: { label: "Essay" },
  deck: { label: "Presentation" },
  project: { label: "Project" },
  series: {
    label: "Series",
    navigation: { slot: "secondary" },
  },
  topic: {
    label: "Topic",
    navigation: { slot: "secondary" },
  },
  note: {
    label: "Note",
    navigation: { show: false },
  },
  link: {
    label: "Link",
    navigation: { slot: "secondary" },
  },
};

const config = defineConfig({
  name: "professional-brain-eval",
  version: "0.1.0",
  aiApiKey: process.env["ANTHROPIC_API_KEY"],

  deployment: {
    domain: "yeehaa.io",
  },

  plugins: [
    new SystemPlugin({}),
    new MCPInterface({}),
    // No MatrixInterface - not needed for evals
    directorySync(),
    // No GitSyncPlugin - prevents syncing with real remote
    new WebserverInterface({
      previewPort: 4321,
      previewDistDir: "./dist/site-preview",
    }),
    blogPlugin({}),
    decksPlugin({}),
    new TopicsPlugin({}),
    new NotePlugin({}),
    new LinkPlugin({}),
    new PortfolioPlugin({}),
    new SocialMediaPlugin({}),
    createNewsletterPlugin({}),
    professionalSitePlugin({
      entityRouteConfig,
    }),
    siteBuilderPlugin({
      routes,
      entityRouteConfig,
      layouts: {
        default: ProfessionalLayout,
        minimal: MinimalLayout,
      },
      themeCSS: yeehaaTheme,
      previewOutputDir: "./dist/site-preview",
      productionOutputDir: "./dist/site-production",
    }),
  ],
});

export default config;
