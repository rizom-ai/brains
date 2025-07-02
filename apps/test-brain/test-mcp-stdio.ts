#!/usr/bin/env bun
/**
 * Test MCP plugin tool registration using STDIO transport
 */

import { spawn } from "child_process";

async function testMCPStdio() {
  console.log("🧪 Testing MCP Plugin Tool Registration (STDIO)...\n");

  // Set up environment for STDIO MCP transport
  const env = {
    ...process.env,
    DATABASE_URL: "file:./test-mcp-stdio.db",
    ANTHROPIC_API_KEY: "test-key",
    MCP_TRANSPORT: "stdio",
    // Enable directory sync plugin so we have plugin tools to test
    SYNC_PATH: "./brain-data",
    WATCH_ENABLED: "false",
    // Disable other interfaces
    WEBSITE_OUTPUT_DIR: "",
    MATRIX_HOMESERVER: "",
  };

  // Start the test-brain app with STDIO
  console.log("📦 Starting test-brain with MCP STDIO transport...");
  const app = spawn("bun", ["run", "src/index.ts"], {
    env,
    stdio: ["pipe", "pipe", "pipe"],
  });

  // Send initialize request
  const initRequest = {
    jsonrpc: "2.0",
    method: "initialize",
    params: {
      protocolVersion: "0.1.0",
      capabilities: {},
      clientInfo: {
        name: "test-client",
        version: "1.0.0",
      },
    },
    id: 1,
  };

  // Wait a bit for startup
  await new Promise((resolve) => setTimeout(resolve, 2000));

  console.log("\n📤 Sending initialize request...");
  app.stdin.write(JSON.stringify(initRequest) + "\n");

  // Collect responses
  let buffer = "";
  const responses: any[] = [];

  app.stdout.on("data", (data) => {
    buffer += data.toString();
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";

    for (const line of lines) {
      if (line.trim()) {
        try {
          const json = JSON.parse(line);
          responses.push(json);
          console.log("📥 Response:", JSON.stringify(json, null, 2));
        } catch (e) {
          // Not JSON, probably log output
          console.log("📝 Log:", line);
        }
      }
    }
  });

  // Wait for initialization
  await new Promise((resolve) => setTimeout(resolve, 3000));

  // Send list tools request
  const listToolsRequest = {
    jsonrpc: "2.0",
    method: "tools/list",
    params: {},
    id: 2,
  };

  console.log("\n📤 Sending tools/list request...");
  app.stdin.write(JSON.stringify(listToolsRequest) + "\n");

  // Wait for response
  await new Promise((resolve) => setTimeout(resolve, 2000));

  // Find the tools response
  const toolsResponse = responses.find((r) => r.id === 2 && r.result?.tools);

  if (toolsResponse) {
    const tools = toolsResponse.result.tools;
    console.log(`\n✅ Found ${tools.length} tools:\n`);

    // Group tools by plugin
    const toolsByPlugin: Record<string, string[]> = {};

    for (const tool of tools) {
      const [pluginId, ...nameParts] = tool.name.split(":");
      const toolName = nameParts.join(":");

      if (!toolsByPlugin[pluginId]) {
        toolsByPlugin[pluginId] = [];
      }
      toolsByPlugin[pluginId].push(toolName || tool.name);
    }

    // Display tools grouped by plugin
    for (const [plugin, pluginTools] of Object.entries(toolsByPlugin)) {
      console.log(`\n🔧 ${plugin} plugin:`);
      for (const tool of pluginTools) {
        console.log(`   - ${tool}`);
      }
    }

    // Check if we have plugin tools
    const pluginTools = tools.filter((t: any) => !t.name.startsWith("shell:"));

    if (pluginTools.length > 0) {
      console.log(
        `\n✅ SUCCESS: Found ${pluginTools.length} plugin tools registered via MessageBus!`,
      );
    } else {
      console.log("\n⚠️  WARNING: No plugin tools found, only shell tools.");
    }
  } else {
    console.log("\n❌ ERROR: No tools response received");
  }

  // Clean up
  console.log("\n🧹 Cleaning up...");
  app.kill();
}

// Run the test
testMCPStdio().catch(console.error);
