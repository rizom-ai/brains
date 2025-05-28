#!/usr/bin/env bun
/**
 * Example stdio server for MCP
 * Shows how other packages would use the MCP server
 *
 * Usage: bun run src/stdio.ts
 */

import { StdioMCPServer } from "./server/stdio-mcp-server";
import { z } from "zod";

async function main(): Promise<void> {
  const server = StdioMCPServer.createFresh({
    name: "Example-MCP-Server",
    version: "1.0.0",
  });

  // Get the MCP server for registration
  const mcp = server.getServer();

  // Example: Register a simple tool using Zod
  mcp.tool(
    "echo",
    {
      message: z.string().describe("Message to echo"),
    },
    async (params) => {
      return {
        content: [
          {
            type: "text" as const,
            text: `Echo: ${params.message}`,
          },
        ],
      };
    },
  );

  // Example: Register a simple resource
  mcp.resource(
    "example",
    "example://resource/{id}",
    {
      description: "Example resource",
    },
    async (uri) => {
      const id = uri.pathname.split("/").pop();

      return {
        contents: [
          {
            uri: uri.href,
            text: JSON.stringify(
              {
                id,
                type: "example",
                message: `This is example resource ${id}`,
              },
              null,
              2,
            ),
          },
        ],
      };
    },
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

void main();
