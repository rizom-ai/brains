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
import { Logger, createSilentLogger } from "@personal-brain/utils";
import { Database } from "bun:sqlite";
import * as path from "path";
import { mkdir, rm } from "fs/promises";

async function main(): Promise<void> {
  // Create logger configured to use stderr for MCP compatibility
  // Check for test mode to silence logs
  const isTestMode = process.env.NODE_ENV === "test" || process.env.SILENT_LOGS === "true";
  const logger = isTestMode 
    ? createSilentLogger("brain-mcp-server")
    : Logger.getInstance({ useStderr: true });
  
  if (!isTestMode) {
    logger.info("Starting Brain MCP Server");
  }

  // Initialize database with a temporary path
  const dbPath = path.join(process.cwd(), ".tmp", "brain-example.db");

  // Ensure the .tmp directory exists
  const tmpDir = path.dirname(dbPath);
  await mkdir(tmpDir, { recursive: true }).catch(() => {}); // Ignore if exists

  const sqlite = new Database(dbPath);
  if (!isTestMode) {
    logger.info(`Database initialized at: ${dbPath}`);
  }

  // Create and initialize Shell
  const shell = Shell.createFresh({ db: sqlite, logger });
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
              database: dbPath,
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
    sqlite.close();

    // Clean up temporary database
    try {
      await rm(dbPath, { force: true });
      await rm(tmpDir, { recursive: true, force: true });
      if (!isTestMode) {
        logger.info("Cleaned up temporary database");
      }
    } catch (error) {
      // Ignore cleanup errors
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