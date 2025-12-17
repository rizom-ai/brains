/**
 * Minimal brain config for running decks plugin evals
 */
import { defineConfig } from "@brains/app";
import { DecksPlugin } from "../src";

const config = defineConfig({
  name: "decks-eval",
  version: "0.1.0",
  aiApiKey: process.env["ANTHROPIC_API_KEY"],
  database: `file:/tmp/decks-eval-${Date.now()}.db`,

  plugins: [new DecksPlugin()],
});

export default config;
