import { App } from "@brains/app";
import { gitSync } from "@brains/git-sync";

// That's it! The entire app in one call
App.run({
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
