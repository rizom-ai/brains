/**
 * Minimal brain config for running link plugin evals
 */
import { defineConfig } from "@brains/app";
import { LinkPlugin } from "../src";

const config = defineConfig({
  name: "link-eval",
  version: "0.1.0",
  aiApiKey: process.env["ANTHROPIC_API_KEY"],
  database: `file:/tmp/link-eval-${Date.now()}.db`,

  plugins: [new LinkPlugin({})],
});

export default config;
