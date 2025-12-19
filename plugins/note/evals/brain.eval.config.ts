/**
 * Minimal brain config for running note plugin evals
 */
import { defineConfig } from "@brains/app";
import { NotePlugin } from "../src";

const config = defineConfig({
  name: "note-eval",
  version: "0.1.0",
  aiApiKey: process.env["ANTHROPIC_API_KEY"],
  database: `file:/tmp/note-eval-${Date.now()}.db`,

  plugins: [new NotePlugin({})],
});

export default config;
