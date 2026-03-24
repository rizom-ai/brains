/**
 * Minimal brain config for running blog plugin evals
 */
import { defineConfig } from "@brains/app";
import { BlogPlugin } from "../src";

const config = defineConfig({
  name: "blog-eval",
  version: "0.1.0",
  aiApiKey: process.env["ANTHROPIC_API_KEY"],
  database: `file:/tmp/blog-eval-${Date.now()}.db`,

  plugins: [new BlogPlugin({})],
});

export default config;
