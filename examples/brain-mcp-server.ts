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
import { 
  QueryProcessor, 
  BrainProtocol,
  EntityService,
  SchemaRegistry,
  EntityRegistry,
  PluginManager,
  MessageBus,
  Registry,
  initDatabase
} from "@personal-brain/shell";
import { Logger } from "@personal-brain/utils";
import { registerShellMCP } from "@personal-brain/shell";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { Database } from "bun:sqlite";
import * as path from "path";
import { mkdir, rm } from "fs/promises";

async function main(): Promise<void> {
  // Create logger configured to use stderr for MCP compatibility
  const logger = Logger.getInstance({ useStderr: true });
  logger.info("Starting Brain MCP Server");

  // Initialize database with a temporary path
  const dbPath = path.join(process.cwd(), ".tmp", "brain-example.db");
  
  // Ensure the .tmp directory exists
  const tmpDir = path.dirname(dbPath);
  await mkdir(tmpDir, { recursive: true }).catch(() => {}); // Ignore if exists
  
  const sqlite = new Database(dbPath);
  initDatabase(sqlite);
  const db = drizzle(sqlite);
  
  logger.info(`Database initialized at: ${dbPath}`);

  // Initialize registries first (they are singletons)
  const registry = Registry.getInstance();
  const entityRegistry = EntityRegistry.getInstance(logger);
  const schemaRegistry = SchemaRegistry.getInstance();
  const messageBus = MessageBus.getInstance(logger);
  const pluginManager = PluginManager.getInstance(registry, logger, messageBus);

  // Initialize services with their dependencies
  const entityService = EntityService.getInstance(db, entityRegistry, logger);
  const queryProcessor = QueryProcessor.getInstance({ entityService, logger });
  const brainProtocol = BrainProtocol.getInstance(logger, messageBus, queryProcessor);

  // Create MCP server
  const mcpServer = MCPServer.createFresh({
    name: "Brain-MCP-Server",
    version: "1.0.0",
  });

  // Register shell functionality with MCP
  registerShellMCP(mcpServer.getServer(), {
    queryProcessor,
    brainProtocol,
    entityService,
    schemaRegistry,
    logger,
  });

  // Add custom brain-specific tools
  const mcp = mcpServer.getServer();

  mcp.tool(
    "brain_status",
    {},
    async () => {
      const entityTypes = entityService.getSupportedEntityTypes();
      const schemas = schemaRegistry.getAllSchemaNames();
      
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({
              status: "operational",
              database: dbPath,
              entityTypes,
              registeredSchemas: schemas,
              components: {
                queryProcessor: "ready",
                brainProtocol: "ready",
                entityService: "ready",
                messageBus: "ready",
              },
            }, null, 2),
          },
        ],
      };
    }
  );

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
            text: JSON.stringify({
              status: "healthy",
              timestamp: new Date().toISOString(),
              uptime: process.uptime(),
            }, null, 2),
          },
        ],
      };
    }
  );

  // Cleanup function
  const cleanup = async () => {
    logger.info("Shutting down Brain MCP Server");
    mcpServer.stop();
    sqlite.close();
    
    // Clean up temporary database
    try {
      await rm(dbPath, { force: true });
      await rm(tmpDir, { recursive: true, force: true });
      logger.info("Cleaned up temporary database");
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