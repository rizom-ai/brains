import { Shell } from "@brains/shell";
import { gitSync } from "@brains/git-sync";

console.log("🧠 Test Brain - Validating Shell Architecture");

async function main(): Promise<void> {
  // Initialize shell with configuration including plugins
  // Following Astro-like pattern where plugins are part of config
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

  // Set up MCP server if running as server
  if (process.argv.includes("--server")) {
    // Get the MCP server from the shell (it's already configured)
    const mcpServer = shell.getMCPServer();

    // Start the MCP server
    console.log("🚀 Starting MCP server...");
    await mcpServer.startStdio();
    console.log("✅ MCP server started successfully");
    console.log("   Use this server with any MCP-compatible client");

    // Keep the server running
    return;
  }

  // Access shell components to verify they work
  const entityService = shell.getEntityService();
  const schemaRegistry = shell.getSchemaRegistry();
  const queryProcessor = shell.getQueryProcessor();

  console.log("✅ Shell components accessible:", {
    hasEntityService: !!entityService,
    hasSchemaRegistry: !!schemaRegistry,
    hasQueryProcessor: !!queryProcessor,
  });

  // Note: We can't create entities without registering their adapters first
  // This will be done when we create the note-context plugin
  console.log("\nℹ️  Entity creation skipped - need context plugins first");

  // Test basic functionality
  try {
    // Execute a simple query to verify everything works
    const result = await shell.query("test query", {});
    console.log("✅ Query executed successfully:", result.answer);
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    if (errorMessage.includes("no such table")) {
      console.log(
        "ℹ️  Query failed: Database schema issue (F32_BLOB might not be supported in SQLite)",
      );
      console.log("   This is expected when using in-memory SQLite database");
    } else if (
      errorMessage.includes("invalid x-api-key") ||
      errorMessage.includes("authentication_error")
    ) {
      console.log("ℹ️  Query failed: Invalid Anthropic API key");
      console.log(
        "   Set ANTHROPIC_API_KEY environment variable to test queries",
      );
    } else {
      console.log("ℹ️  Query failed:", errorMessage);
    }
  }

  console.log("🎉 Test Brain initialized successfully!");

  // Cleanup and exit
  console.log("🔚 Shutting down...");
  shell.shutdown();
  process.exit(0);
}

// Run the main function
main().catch((error) => {
  console.error("❌ Test Brain failed to initialize:", error);
  process.exit(1);
});
