#!/usr/bin/env bun

import { App } from "@brains/app";
import { Shell } from "@brains/shell";
import { createMockAIService } from "./mock-ai-service";

// Create shell with mock AI service
const shell = Shell.createFresh(
  {
    database: { url: process.env["DATABASE_URL"] ?? "file::memory:" },
    features: {
      enablePlugins: false,
    },
  },
  {
    aiService: createMockAIService(),
  },
);

// Create app with the shell
const app = App.create(
  {
    name: "test-mcp-server",
    version: "1.0.0",
    transport: { type: "stdio" },
    database: process.env["DATABASE_URL"] ?? "file::memory:",
    logLevel: "error",
  },
  shell,
);

await app.initialize();
await app.start();
