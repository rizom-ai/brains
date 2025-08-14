#!/usr/bin/env bun
import { defineConfig, handleCLI } from "@brains/app";
import { SystemPlugin } from "@brains/system";
import { MCPInterface } from "@brains/mcp";
import { MatrixInterface } from "@brains/matrix";
import { directorySync } from "@brains/directory-sync";
import { WebserverInterface } from "@brains/webserver";
import { siteBuilderPlugin } from "@brains/site-builder-plugin";
import { templates, routes } from "@brains/default-site-content";

const config = defineConfig({
  name: "test-brain",
  version: "1.0.0",
  aiApiKey: process.env["ANTHROPIC_API_KEY"],

  plugins: [
    new SystemPlugin({}),
    new MCPInterface({}),
    new MatrixInterface({
      homeserver: process.env["MATRIX_HOMESERVER"] || "https://matrix.rizom.ai",
      accessToken: process.env["MATRIX_ACCESS_TOKEN"] || "",
      userId: process.env["MATRIX_USER_ID"] || "@testbrain-dev:rizom.ai",
      anchorUserId: process.env["MATRIX_ANCHOR_USER_ID"] || "@yeehaa:rizom.ai",
    }),
    directorySync({}),
    new WebserverInterface({}),
    siteBuilderPlugin({
      templates,
      routes,
    }),
  ],
});

// If this file is run directly, handle CLI and run the app
if (import.meta.main) {
  handleCLI(config);
}

export default config;
