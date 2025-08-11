import { App } from "@brains/app";
import { directorySync } from "@brains/directory-sync";
import { siteBuilderPlugin } from "@brains/site-builder-plugin";
import { templates, routes } from "@brains/default-site-content";
import { MatrixInterface } from "@brains/matrix";
import { MCPInterface } from "@brains/mcp";
import { WebserverInterface } from "@brains/webserver";
import { SystemPlugin } from "@brains/system";

// Run the app - command line args are parsed automatically by App
// Usage:
//   bun run src/index.ts              # Runs with all configured interfaces
//   bun run src/index.ts --cli        # Also adds CLI interface
//
// Matrix interface is enabled automatically when environment variables are set:
// MATRIX_HOMESERVER, MATRIX_ACCESS_TOKEN, MATRIX_USER_ID, MATRIX_ANCHOR_USER_ID
async function main(): Promise<void> {
  // Set job queue database URL if not already set
  if (!process.env["JOB_QUEUE_DATABASE_URL"]) {
    process.env["JOB_QUEUE_DATABASE_URL"] = "file:./test-brain-jobs.db";
  }

  await App.run({
    name: "test-brain",
    version: "1.0.0",
    database: process.env["DATABASE_URL"] ?? "file:./test-brain.db",
    aiApiKey: process.env["ANTHROPIC_API_KEY"] ?? "test-key",
    logLevel: "debug",
    // Pass shell config to set conversation database
    shellConfig: {
      conversationDatabase: {
        url:
          process.env["CONVERSATION_DATABASE_URL"] ??
          "file:./conversation-memory.db",
      },
    },
    // CLI config used when --cli flag is present
    cliConfig: {
      theme: {
        primaryColor: "#00ff00",
        accentColor: "#ffff00",
      },
    },
    interfaces: [],
    plugins: [
      // System plugin - provides core commands and tools (search, get, query, etc.)
      new SystemPlugin({
        searchLimit: 10,
        debug: false,
      }),
      // MCP interface plugin - provides Model Context Protocol server
      new MCPInterface({
        transport: process.env["MCP_TRANSPORT"] === "stdio" ? "stdio" : "http",
        httpPort: Number(process.env["BRAIN_SERVER_PORT"] ?? 3333),
      }),
      // Webserver interface plugin (if configured in environment)
      ...(process.env["WEBSITE_OUTPUT_DIR"]
        ? [
            new WebserverInterface({
              previewDistDir: process.env["WEBSITE_OUTPUT_DIR"],
              productionDistDir:
                process.env["WEBSITE_PRODUCTION_OUTPUT_DIR"] ??
                process.env["WEBSITE_OUTPUT_DIR"] + "-production",
              previewPort: Number(process.env["WEBSITE_PREVIEW_PORT"] ?? 4321),
              productionPort: Number(
                process.env["WEBSITE_PRODUCTION_PORT"] ?? 8080,
              ),
            }),
          ]
        : []),
      // Matrix interface plugin (if configured in environment)
      ...(process.env["MATRIX_HOMESERVER"] &&
      process.env["MATRIX_ACCESS_TOKEN"] &&
      process.env["MATRIX_USER_ID"] &&
      process.env["MATRIX_ANCHOR_USER_ID"]
        ? [
            new MatrixInterface({
              homeserver: process.env["MATRIX_HOMESERVER"],
              accessToken: process.env["MATRIX_ACCESS_TOKEN"],
              userId: process.env["MATRIX_USER_ID"],
              anchorUserId: process.env["MATRIX_ANCHOR_USER_ID"],
              trustedUsers: process.env["MATRIX_TRUSTED_USERS"]
                ? process.env["MATRIX_TRUSTED_USERS"].split(",")
                : undefined,
            }),
          ]
        : []),
      // Directory sync plugin for file-based storage (if configured)
      ...(process.env["SYNC_PATH"]
        ? [
            directorySync({
              syncPath: process.env["SYNC_PATH"],
              watchEnabled: process.env["WATCH_ENABLED"] === "true",
              watchInterval: process.env["WATCH_INTERVAL"]
                ? Number(process.env["WATCH_INTERVAL"])
                : 5000,
              includeMetadata: true,
            }),
          ]
        : []),
      // Site builder plugin for generating static sites
      ...(process.env["WEBSITE_OUTPUT_DIR"]
        ? [
            siteBuilderPlugin({
              previewOutputDir: process.env["WEBSITE_OUTPUT_DIR"],
              productionOutputDir:
                process.env["WEBSITE_PRODUCTION_OUTPUT_DIR"] ??
                process.env["WEBSITE_OUTPUT_DIR"] + "-production",
              workingDir:
                process.env["WEBSITE_WORKING_DIR"] ?? "/tmp/site-builder",
              templates, // Pass templates from default-site-content
              routes, // Pass routes from default-site-content
            }),
          ]
        : []),
      // Future: noteContext(), taskContext(), etc.
    ],
  });
}

// Start the app
main().catch((error) => {
  console.error("Failed to start app:", error);
  process.exit(1);
});
