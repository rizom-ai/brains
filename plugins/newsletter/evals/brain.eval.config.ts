/**
 * Minimal brain config for running newsletter plugin evals
 */
import { defineConfig } from "@brains/app";
import { NewsletterPlugin } from "../src";

const config = defineConfig({
  name: "newsletter-eval",
  version: "0.1.0",
  aiApiKey: process.env["ANTHROPIC_API_KEY"],
  database: `file:/tmp/newsletter-eval-${Date.now()}.db`,

  deployment: {
    domain: "example.com",
  },

  plugins: [new NewsletterPlugin({})],
});

export default config;
