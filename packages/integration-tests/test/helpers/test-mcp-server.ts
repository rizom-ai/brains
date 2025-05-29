#!/usr/bin/env bun

import { App } from "@brains/app";

// Create and run a test MCP server for integration tests
await App.run({
  name: "test-mcp-server",
  version: "1.0.0",
  transport: { type: "stdio" },
  database: "file::memory:",
  aiApiKey: "test-key",
  logLevel: "error",
  shellConfig: {
    features: {
      enablePlugins: false,
      runMigrationsOnInit: true,
    },
  },
});
