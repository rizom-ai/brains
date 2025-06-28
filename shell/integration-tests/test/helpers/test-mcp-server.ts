#!/usr/bin/env bun

import { App } from "@brains/app";
import { Shell } from "@brains/core";
import { createMockAIService } from "./mock-ai-service";
import { createSilentLogger } from "@brains/utils";

// Create shell with mock AI service and silent logger
const shell = Shell.createFresh(
  {
    database: { url: process.env["DATABASE_URL"] ?? "file::memory:" },
    features: {
      enablePlugins: false,
    },
  },
  {
    aiService: createMockAIService(),
    logger: createSilentLogger(),
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
