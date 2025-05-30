import { App } from "@brains/app";
import { gitSync } from "@brains/git-sync";

// Run the app - command line args are parsed automatically by App
// Usage:
//   bun run src/index.ts              # MCP server only
//   bun run src/index.ts --cli        # MCP server + CLI interface
//   bun run src/index.ts --matrix     # MCP server + Matrix interface
//   bun run src/index.ts --cli --matrix # All interfaces
async function main(): Promise<void> {
  await App.run({
    name: "test-brain",
    version: "1.0.0",
    transport: {
      type: "http",
      port: Number(process.env["BRAIN_SERVER_PORT"] ?? 3333),
      host: "localhost",
    },
    database: process.env["DATABASE_URL"] ?? "file:./test-brain.db",
    aiApiKey: process.env["ANTHROPIC_API_KEY"] ?? "test-key",
    logLevel: "debug",
    // CLI config used when --cli flag is present
    cliConfig: {
      shortcuts: {
        nn: "create note",
        ln: "list notes",
        sn: "search notes",
      },
    },
    // Interfaces can also be explicitly configured here
    interfaces: [
      // Example: Always enable a specific interface
      // { type: "cli", enabled: true, config: { /* ... */ } }
    ],
    plugins: [
      // Git sync plugin for version control
      gitSync({
        repoPath: "/home/yeehaa/Documents/brain",
        branch: "main",
        autoSync: false, // Manual sync for testing
      }),
      // Future: noteContext(), taskContext(), etc.
    ],
  });
}

// Start the app
main().catch((error) => {
  console.error("Failed to start app:", error);
  process.exit(1);
});
