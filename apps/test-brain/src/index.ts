import { App } from "@brains/app";
import { directorySync } from "@brains/directory-sync";
import { siteBuilderPlugin } from "@brains/site-builder-plugin";
import { templates, routes } from "@brains/default-site-content";
import { MatrixInterface } from "@brains/matrix";
import { WebserverInterface } from "@brains/webserver";

// Run the app - command line args are parsed automatically by App
// Usage:
//   bun run src/index.ts              # MCP server only
//   bun run src/index.ts --cli        # MCP server + CLI interface
//
// Matrix interface is enabled automatically when environment variables are set:
// MATRIX_HOMESERVER, MATRIX_ACCESS_TOKEN, MATRIX_USER_ID, MATRIX_ANCHOR_USER_ID
async function main(): Promise<void> {
  await App.run({
    name: "test-brain",
    version: "1.0.0",
    transport: {
      type: "http",
      port: Number(process.env["BRAIN_SERVER_PORT"] ?? 3333),
      host: "localhost",
    },
    database: process.env["DATABASE_URL"] ?? "file:./data/test-brain.db",
    aiApiKey: process.env["ANTHROPIC_API_KEY"] ?? "test-key",
    logLevel: "debug",
    // CLI config used when --cli flag is present
    cliConfig: {
      theme: {
        primaryColor: "#00ff00",
        accentColor: "#ffff00",
      },
      shortcuts: {
        nn: "create note",
        ln: "list notes",
        sn: "search notes",
      },
    },
    interfaces: [],
    plugins: [
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
