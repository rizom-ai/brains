#!/usr/bin/env bun
/**
 * Test MCP Client
 *
 * This script tests the MCP server by sending requests to it.
 * It demonstrates how an MCP client would interact with our server.
 *
 * Usage: bun run examples/test-mcp-client.ts
 */

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

async function main(): Promise<void> {
  console.log("Starting MCP client test...");

  // Create client transport that connects to our server
  const transport = new StdioClientTransport({
    command: "bun",
    args: ["run", "examples/brain-mcp-server.ts"],
  });

  // Create client
  const client = new Client({
    name: "test-client",
    version: "1.0.0",
  });

  try {
    // Connect to server
    console.log("Connecting to MCP server...");
    await client.connect(transport);
    console.log("Connected!");

    // List available tools
    console.log("\n=== Available Tools ===");
    const tools = await client.listTools();
    for (const tool of tools.tools) {
      console.log(`- ${tool.name}: ${tool.description}`);
    }

    // List available resources
    console.log("\n=== Available Resources ===");
    const resources = await client.listResources();
    for (const resource of resources.resources) {
      console.log(
        `- ${resource.uri}: ${resource.description ?? "No description"}`,
      );
    }

    // Test brain_status tool
    console.log("\n=== Testing brain_status tool ===");
    const statusResult = await client.callTool({
      name: "brain_status",
      arguments: {},
    });
    console.log("Status:", JSON.stringify(statusResult, null, 2));

    // Test brain_query tool
    console.log("\n=== Testing brain_query tool ===");
    const queryResult = await client.callTool({
      name: "brain_query",
      arguments: {
        query: "What is the meaning of life?",
        options: {
          limit: 5,
        },
      },
    });
    console.log("Query result:", JSON.stringify(queryResult, null, 2));

    // Test health resource
    console.log("\n=== Testing health resource ===");
    const healthResource = await client.readResource({
      uri: "brain://health",
    });
    console.log("Health:", JSON.stringify(healthResource, null, 2));

    console.log("\n✅ All tests completed successfully!");
  } catch (error) {
    console.error("Test failed:", error);
  } finally {
    // Clean up
    await client.close();
    process.exit(0);
  }
}

void main();
