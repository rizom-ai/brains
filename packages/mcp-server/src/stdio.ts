#!/usr/bin/env bun
/**
 * Example stdio server for MCP
 * Shows how other packages would use the MCP server
 * 
 * Usage: bun run src/stdio.ts
 */

import { MCPServer } from "./server/mcpServer";

async function main() {
  const server = MCPServer.createFresh({
    name: "Example-MCP-Server",
    version: "1.0.0",
  });

  // Get the MCP server for registration
  const mcp = server.getServer();

  // Example: Register a simple tool
  mcp.tool(
    "echo",
    "Echo back the input",
    async (extra: Record<string, unknown>) => {
      const params = extra["params"] as { message?: string } || {};
      const message = params.message || "No message provided";

      return {
        content: [
          {
            type: "text" as const,
            text: `Echo: ${message}`,
          },
        ],
      };
    }
  );

  // Example: Register a simple resource
  mcp.resource(
    "example",
    ":id",
    { description: "Example resource" },
    async (uri: URL) => {
      const id = uri.pathname.split("/").pop();
      
      return {
        contents: [
          {
            uri: uri.toString(),
            text: JSON.stringify({
              id,
              type: "example",
              message: `This is example resource ${id}`,
            }, null, 2),
          },
        ],
      };
    }
  );

  try {
    await server.startStdio();
    
    // Keep the process alive
    process.stdin.resume();
  } catch (error) {
    console.error("Failed to start MCP server:", error);
    process.exit(1);
  }
}

main();