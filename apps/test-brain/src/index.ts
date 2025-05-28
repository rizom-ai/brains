import { Shell } from "@brains/shell";
import { gitSync } from "@brains/git-sync";
import { StreamableHTTPServer } from "@brains/mcp-server";

console.log("🧠 Test Brain - Brain MCP Server");

async function main(): Promise<void> {
  try {
    // Initialize shell with configuration including plugins
    const shell = Shell.getInstance({
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
    });

    // Initialize the shell (runs migrations, sets up plugins, etc.)
    await shell.initialize();
    console.log("✅ Shell initialized successfully with plugins");

    // Start StreamableHTTP server as default behavior
    await startStreamableHttpServer(shell);

    // Also start STDIO server for backward compatibility
    await startStdioServer(shell);
  } catch (error) {
    console.error("❌ Failed to start brain server:", error);
    process.exit(1);
  }
}

async function startStreamableHttpServer(shell: Shell): Promise<void> {
  const PORT = process.env["BRAIN_SERVER_PORT"] ?? 3333;

  // Create StreamableHTTP server with custom logger
  const httpServer = new StreamableHTTPServer({
    port: PORT,
    logger: {
      info: (msg: string) => console.log(`[test-brain] ${msg}`),
      debug: (msg: string) => console.log(`[test-brain] ${msg}`),
      error: (msg: string, err?: unknown) =>
        console.error(`[test-brain] ${msg}`, err),
      warn: (msg: string) => console.warn(`[test-brain] ${msg}`),
    },
  });

  // Connect the MCP server to the HTTP transport
  const mcpServer = shell.getMCPServer().getServer();
  httpServer.connectMCPServer(mcpServer);

  // Start the server
  try {
    await httpServer.start();
    console.log(`🚀 Brain MCP server ready at http://localhost:${PORT}/mcp`);
    console.log(`   Health check: http://localhost:${PORT}/health`);
    console.log(`   Status: http://localhost:${PORT}/status`);
  } catch (error) {
    if ((error as any).code === "EADDRINUSE") {
      console.error(`❌ Error: Port ${PORT} is already in use`);
      process.exit(1);
    }
    throw error;
  }
}

async function startStdioServer(_shell: Shell): Promise<void> {
  // Keep STDIO server for backward compatibility
  console.log("🔧 STDIO MCP server also available for legacy clients");
  // Note: We don't start STDIO automatically to avoid blocking the HTTP server
  // STDIO can be started with a flag if needed
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
