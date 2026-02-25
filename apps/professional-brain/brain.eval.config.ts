#!/usr/bin/env bun
/**
 * Eval-specific brain config
 * Git-sync included with empty URL and no auto-sync to register tools without syncing
 */
import { defineConfig } from "@brains/app";
import { systemPlugin } from "@brains/system";
import { imagePlugin } from "@brains/image-plugin";
import { gitSyncPlugin } from "@brains/git-sync";
import { MCPInterface } from "@brains/mcp";
import { WebserverInterface } from "@brains/webserver";
import { directorySync } from "@brains/directory-sync";
import { siteBuilderPlugin } from "@brains/site-builder-plugin";
import { blogPlugin } from "@brains/blog";
import { decksPlugin } from "@brains/decks";
import { topicsPlugin } from "@brains/topics";
import { notePlugin } from "@brains/note";
import { linkPlugin } from "@brains/link";
import { portfolioPlugin } from "@brains/portfolio";
import { socialMediaPlugin } from "@brains/social-media";
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
  base: {
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
  openaiApiKey: process.env["OPENAI_API_KEY"],
  googleApiKey: process.env["GOOGLE_GENERATIVE_AI_API_KEY"],

  deployment: {
    domain: "yeehaa.io",
  },

  plugins: [
    systemPlugin({}),
    imagePlugin(),
    new MCPInterface({}),
    // No MatrixInterface - not needed for evals
    directorySync(),
    gitSyncPlugin({
      gitUrl: "file:///tmp/brain-eval-git-remote",
      autoSync: false,
      autoPush: false,
    }),
    new WebserverInterface({
      previewPort: 4321,
      previewDistDir: "./dist/site-preview",
    }),
    blogPlugin({}),
    decksPlugin(),
    topicsPlugin({}),
    notePlugin({}),
    linkPlugin({}),
    portfolioPlugin({}),
    socialMediaPlugin({}),
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
