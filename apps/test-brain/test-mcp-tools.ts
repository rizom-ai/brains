#!/usr/bin/env bun
/**
 * Test script to verify MCP plugin tool registration
 *
 * This script starts the test-brain app with MCP interface in HTTP mode
 * and lists the registered tools to verify plugin tools are properly exposed
 */

import { spawn } from "child_process";
import { setTimeout } from "timers/promises";

async function testMCPTools() {
  console.log("🧪 Testing MCP Plugin Tool Registration...\n");

  // Set up environment for HTTP MCP transport
  const env = {
    ...process.env,
    DATABASE_URL: "file:./test-mcp.db",
    ANTHROPIC_API_KEY: "test-key",
    MCP_TRANSPORT: "http",
    BRAIN_SERVER_PORT: "4444",
    // Enable directory sync plugin so we have plugin tools to test
    SYNC_PATH: "./brain-data",
    WATCH_ENABLED: "false",
    // Disable webserver to avoid port conflicts
    WEBSITE_OUTPUT_DIR: "",
  };

  // Start the test-brain app
  console.log("📦 Starting test-brain with MCP HTTP server on port 4444...");
  const app = spawn("bun", ["run", "src/index.ts"], {
    env,
    stdio: ["ignore", "pipe", "pipe"],
  });

  let output = "";
  app.stdout.on("data", (data) => {
    const text = data.toString();
    output += text;
    process.stdout.write(text);
  });

  app.stderr.on("data", (data) => {
    const text = data.toString();
    output += text;
    process.stderr.write(text);
  });

  // Wait for server to start and initialize
  await setTimeout(5000);

  // Check if MCP server is running and tools are registered
  try {
    console.log("\n📋 Checking MCP server tools...");

    // Send a list_tools request to the MCP server
    const response = await fetch("http://localhost:4444/mcp", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        method: "tools/list",
        params: {},
        id: 1,
      }),
    });

    const result = await response.json();

    if (result.result && result.result.tools) {
      console.log(`\n✅ Found ${result.result.tools.length} tools:\n`);

      // Group tools by plugin
      const toolsByPlugin: Record<string, string[]> = {};

      for (const tool of result.result.tools) {
        const [pluginId, ...nameParts] = tool.name.split(":");
        const toolName = nameParts.join(":");

        if (!toolsByPlugin[pluginId]) {
          toolsByPlugin[pluginId] = [];
        }
        toolsByPlugin[pluginId].push(toolName || tool.name);
      }

      // Display tools grouped by plugin
      for (const [plugin, tools] of Object.entries(toolsByPlugin)) {
        console.log(`\n🔧 ${plugin} plugin:`);
        for (const tool of tools) {
          console.log(`   - ${tool}`);
        }
      }

      // Check if we have plugin tools (not just shell tools)
      const pluginTools = result.result.tools.filter(
        (t: any) => !t.name.startsWith("shell:"),
      );

      if (pluginTools.length > 0) {
        console.log(`\n✅ SUCCESS: Found ${pluginTools.length} plugin tools!`);
      } else {
        console.log("\n⚠️  WARNING: No plugin tools found, only shell tools.");
      }
    } else {
      console.error("\n❌ ERROR: No tools found in response:", result);
    }
  } catch (error) {
    console.error("\n❌ ERROR: Failed to connect to MCP server:", error);
  } finally {
    // Clean up
    console.log("\n🧹 Cleaning up...");
    app.kill();
    await setTimeout(500);
  }
}

// Run the test
testMCPTools().catch(console.error);
