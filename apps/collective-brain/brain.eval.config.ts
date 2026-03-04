#!/usr/bin/env bun
/**
 * Eval-specific brain config for collective-brain
 * Excludes git-sync auto-push and message interfaces to keep evals isolated
 */
import { defineConfig } from "@brains/app";
import { systemPlugin } from "@brains/system";
import { MCPInterface } from "@brains/mcp";
import { directorySync } from "@brains/directory-sync";
import { notePlugin } from "@brains/note";
import { linkPlugin } from "@brains/link";
import { socialMediaPlugin } from "@brains/social-media";
import { productsPlugin } from "@brains/products";
import { wishlistPlugin } from "@brains/wishlist";

const config = defineConfig({
  name: "collective-brain-eval",
  version: "0.1.0",
  aiApiKey: process.env["ANTHROPIC_API_KEY"],

  plugins: [
    systemPlugin({}),
    new MCPInterface({}),
    directorySync(),
    notePlugin({}),
    linkPlugin({}),
    socialMediaPlugin({}),
    productsPlugin(),
    wishlistPlugin({}),
  ],
});

export default config;
