/**
 * Minimal brain config for running topics plugin evals
 */
import { defineConfig } from "@brains/app";
import TopicsPlugin from "../src";

const config = defineConfig({
  name: "topics-eval",
  version: "0.1.0",
  aiApiKey: process.env["ANTHROPIC_API_KEY"],
  database: `file:/tmp/topics-eval-${Date.now()}.db`,

  plugins: [new TopicsPlugin({})],
});

export default config;
