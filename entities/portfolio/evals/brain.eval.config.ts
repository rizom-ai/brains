/**
 * Minimal brain config for running portfolio plugin evals
 */
import { defineConfig } from "@brains/app";
import { PortfolioPlugin } from "../src";

const config = defineConfig({
  name: "portfolio-eval",
  version: "0.1.0",
  aiApiKey: process.env["ANTHROPIC_API_KEY"],
  database: `file:/tmp/portfolio-eval-${Date.now()}.db`,

  plugins: [new PortfolioPlugin({})],
});

export default config;
