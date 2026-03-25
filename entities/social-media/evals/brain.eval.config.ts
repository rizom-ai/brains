/**
 * Minimal brain config for running social-media plugin evals
 */
import { defineConfig } from "@brains/app";
import { SocialMediaPlugin } from "../src";

const config = defineConfig({
  name: "social-media-eval",
  version: "0.1.0",
  aiApiKey: process.env["ANTHROPIC_API_KEY"],
  database: `file:/tmp/social-media-eval-${Date.now()}.db`,

  deployment: {
    domain: "example.com",
  },

  plugins: [new SocialMediaPlugin({})],
});

export default config;
