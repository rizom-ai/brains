import { Shell } from "@brains/shell";
import { gitSync } from "@brains/git-sync";
import { StreamableHTTPServer } from "@brains/mcp-server";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

console.log("🧠 Test Brain - Brain MCP Server");

async function main(): Promise<void> {
  try {
    // Create MCP server instance
    const mcpServer = new McpServer({
      name: "test-brain-mcp",
      version: "1.0.0",
    });

    // Create StreamableHTTP server
    const httpServer = new StreamableHTTPServer({
      port: process.env["BRAIN_SERVER_PORT"] ?? 3333,
      logger: {
        info: (msg: string) => console.log(`[test-brain] ${msg}`),
        debug: (msg: string) => console.log(`[test-brain] ${msg}`),
        error: (msg: string, err?: unknown) =>
          console.error(`[test-brain] ${msg}`, err),
        warn: (msg: string) => console.warn(`[test-brain] ${msg}`),
      },
    });
    
    // Connect MCP server to HTTP transport
    httpServer.connectMCPServer(mcpServer);

    // Initialize shell with configuration including plugins
    const shell = Shell.createFresh({
      database: {
        url: process.env["DATABASE_URL"] ?? "file:./test-brain.db",
      },
      ai: {
        provider: "anthropic" as const,
        apiKey: process.env["ANTHROPIC_API_KEY"] ?? "test-key",
        model: "claude-3-haiku-20240307",
        temperature: 0.7,
        maxTokens: 1000,
      },
      logging: {
        level: "debug" as const,
        context: "test-brain",
      },
      features: {
        enablePlugins: true,
        runMigrationsOnInit: false, // Disable migrations for compiled binary
      },
      plugins: [
        // Git sync plugin for version control
        gitSync({
          repoPath: "/home/yeehaa/Documents/brain", // Use existing brain directory
          branch: "main",
          autoSync: false, // Manual sync for testing
        }),
        // Future: noteContext(), taskContext(), etc.
      ],
    }, {
      mcpServer, // Pass the MCP server as a dependency
    });

    // Initialize the shell (runs migrations, sets up plugins, etc.)
    await shell.initialize();
    console.log("✅ Shell initialized successfully with plugins");
    
    // Start the HTTP server
    await httpServer.start();
    console.log("🚀 Brain MCP server ready at http://localhost:3333/mcp");
    console.log("   Health check: http://localhost:3333/health");
    console.log("   Status: http://localhost:3333/status");

    // Keep process alive
    process.stdin.resume();
  } catch (error) {
    console.error("❌ Failed to start brain server:", error);
    process.exit(1);
  }
}

// Graceful shutdown
process.on("SIGTERM", () => {
  console.log("Received SIGTERM, shutting down gracefully...");
  process.exit(0);
});

process.on("SIGINT", () => {
  console.log("Received SIGINT, shutting down gracefully...");
  process.exit(0);
});

// Run the main function
main().catch((error) => {
  console.error("❌ Test Brain failed to initialize:", error);
  process.exit(1);
});
