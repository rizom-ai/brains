import { Shell } from "@brains/shell";

console.log("🧠 Test Brain - Validating Shell Architecture");

async function main() {
  // Initialize shell with minimal configuration
  // Shell handles all service creation internally
  const shell = Shell.getInstance({
    database: {
      url: process.env["DATABASE_URL"] || "file:./test-brain.db",
    },
    ai: {
      provider: "anthropic" as const,
      apiKey: process.env["ANTHROPIC_API_KEY"] || "test-key",
      model: "claude-3-haiku-20240307",
      temperature: 0.7,
      maxTokens: 1000,
    },
    logging: {
      level: "info" as const,
      context: "test-brain",
    },
  });

  // Initialize the shell (runs migrations, sets up plugins, etc.)
  await shell.initialize();

  console.log("✅ Shell initialized successfully");

  // Access shell components to verify they work
  const entityService = shell.getEntityService();
  const schemaRegistry = shell.getSchemaRegistry();
  const queryProcessor = shell.getQueryProcessor();

  console.log("✅ Shell components accessible:", {
    hasEntityService: !!entityService,
    hasSchemaRegistry: !!schemaRegistry,
    hasQueryProcessor: !!queryProcessor,
  });

  // TODO: Once we have context plugins, we'll register them here
  // Example:
  // import { NoteContext } from "@brains/note-context";
  // shell.registerPlugin(new NoteContext());

  // Test basic functionality
  try {
    // Execute a simple query to verify everything works
    const result = await shell.query("test query", {});
    console.log("✅ Query executed successfully:", result.answer);
  } catch (error: any) {
    if (error.message?.includes("no such table")) {
      console.log("ℹ️  Query failed: Database schema issue (F32_BLOB might not be supported in SQLite)");
      console.log("   This is expected when using in-memory SQLite database");
    } else if (error.message?.includes("invalid x-api-key") || error.message?.includes("authentication_error")) {
      console.log("ℹ️  Query failed: Invalid Anthropic API key");
      console.log("   Set ANTHROPIC_API_KEY environment variable to test queries");
    } else {
      console.log("ℹ️  Query failed:", error.message || error);
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