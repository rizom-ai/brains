#!/usr/bin/env bun
/**
 * Brain MCP Server Example
 *
 * This demonstrates how to create an MCP server that exposes
 * the full shell functionality (query processing, entity management, etc.)
 *
 * Usage: bun run examples/brain-mcp-server.ts
 */

import { MCPServer } from "@brains/mcp-server";
import { Shell, registerShellMCP } from "@personal-brain/shell";
import { EmbeddingService } from "@personal-brain/shell";
import { AIService } from "@personal-brain/shell";
import type { IEmbeddingService } from "@personal-brain/shell";
import { Logger, createSilentLogger } from "@personal-brain/utils";
import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import * as path from "path";
import { mkdir, rm } from "fs/promises";

async function main(): Promise<void> {
  // Create logger configured to use stderr for MCP compatibility
  // Check for test mode to silence logs
  const isTestMode =
    process.env.NODE_ENV === "test" || process.env.SILENT_LOGS === "true";
  const logger = isTestMode
    ? createSilentLogger("brain-mcp-server")
    : Logger.getInstance({ useStderr: true });

  if (!isTestMode) {
    logger.info("Starting Brain MCP Server");
  }

  // Initialize database - respect DATABASE_URL if provided
  let dbUrl: string;
  let tempDir: string | undefined;

  if (process.env.DATABASE_URL) {
    dbUrl = process.env.DATABASE_URL;
  } else {
    // Create temporary database
    const dbPath = path.join(process.cwd(), ".tmp", "brain-example.db");
    tempDir = path.dirname(dbPath);
    await mkdir(tempDir, { recursive: true }).catch(() => {}); // Ignore if exists
    dbUrl = `file:${dbPath}`;
  }

  // Create libSQL client and Drizzle database
  const client = createClient({ url: dbUrl });
  const db = drizzle(client);

  if (!isTestMode) {
    logger.info(`Database initialized at: ${dbUrl}`);
  }

  // Create services
  let embeddingService: IEmbeddingService;
  
  if (isTestMode) {
    // Use mock embedding service in test mode to avoid native module issues
    embeddingService = {
      generateEmbedding: async () => new Float32Array(384).fill(0.1),
      generateEmbeddings: async (texts: string[]) =>
        texts.map(() => new Float32Array(384).fill(0.1)),
    };
  } else {
    embeddingService = EmbeddingService.createFresh(logger);
    await embeddingService.initialize();
  }

  const aiService = AIService.createFresh(
    { apiKey: process.env.ANTHROPIC_API_KEY || "test-key" },
    logger,
  );

  // Create and initialize Shell
  const shell = Shell.createFresh({
    db,
    logger,
    embeddingService,
    aiService,
  });
  await shell.initialize();

  // Create MCP server
  const mcpServer = MCPServer.createFresh({
    name: "Brain-MCP-Server",
    version: "1.0.0",
    logger: {
      info: (msg: string) => logger.info(msg),
      debug: (msg: string) => logger.debug(msg),
      error: (msg: string, err?: unknown) => logger.error(msg, err),
      warn: (msg: string) => logger.warn(msg),
    },
  });

  // Register shell functionality with MCP
  registerShellMCP(mcpServer.getServer(), {
    queryProcessor: shell.getQueryProcessor(),
    brainProtocol: shell.getBrainProtocol(),
    entityService: shell.getEntityService(),
    schemaRegistry: shell.getSchemaRegistry(),
    logger,
  });

  // Add custom brain-specific tools
  const mcp = mcpServer.getServer();

  mcp.tool("brain_status", {}, async () => {
    const entityTypes = shell.getEntityService().getSupportedEntityTypes();
    const schemas = shell.getSchemaRegistry().getAllSchemaNames();

    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify(
            {
              status: "operational",
              database: dbUrl,
              entityTypes,
              registeredSchemas: schemas,
              components: {
                shell: shell.isInitialized() ? "ready" : "not initialized",
                queryProcessor: "ready",
                brainProtocol: "ready",
                entityService: "ready",
              },
            },
            null,
            2,
          ),
        },
      ],
    };
  });

  // Add health check resource
  mcp.resource(
    "health",
    "brain://health",
    { description: "Health check endpoint" },
    async (uri) => {
      return {
        contents: [
          {
            uri: uri.href,
            text: JSON.stringify(
              {
                status: "healthy",
                timestamp: new Date().toISOString(),
                uptime: process.uptime(),
                shellInitialized: shell.isInitialized(),
              },
              null,
              2,
            ),
          },
        ],
      };
    },
  );

  // Cleanup function
  const cleanup = async () => {
    if (!isTestMode) {
      logger.info("Shutting down Brain MCP Server");
    }
    shell.shutdown();
    mcpServer.stop();
    client.close();

    // Clean up temporary database if we created one
    if (tempDir && !process.env.DATABASE_URL) {
      try {
        await rm(dbUrl.replace("file:", ""), { force: true });
        await rm(tempDir, { recursive: true, force: true });
        if (!isTestMode) {
          logger.info("Cleaned up temporary database");
        }
      } catch (error) {
        // Ignore cleanup errors
      }
    }
  };

  // Handle shutdown gracefully
  process.on("SIGINT", async () => {
    await cleanup();
    process.exit(0);
  });

  process.on("SIGTERM", async () => {
    await cleanup();
    process.exit(0);
  });

  // Also cleanup on normal exit
  process.on("exit", () => {
    // Synchronous cleanup on exit
    try {
      sqlite.close();
    } catch {}
  });

  // Start the server
  try {
    logger.info("Starting MCP server on stdio");
    await mcpServer.startStdio();

    // Keep the process alive
    process.stdin.resume();
  } catch (error) {
    logger.error("Failed to start MCP server", error);
    process.exit(1);
  }
}

void main();
