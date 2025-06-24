import { App, getMatrixInterfaceFromEnv } from "@brains/app";
import { directorySync } from "@brains/directory-sync";
import { siteBuilderPlugin } from "@brains/site-builder-plugin";
import { templates, routes } from "@brains/default-site-content";

// Run the app - command line args are parsed automatically by App
// Usage:
//   bun run src/index.ts              # MCP server only
//   bun run src/index.ts --cli        # MCP server + CLI interface
//   bun run src/index.ts --matrix     # MCP server + Matrix interface
//   bun run src/index.ts --cli --matrix # All interfaces
async function main(): Promise<void> {
  // Get Matrix config from environment if available
  const matrixInterface = getMatrixInterfaceFromEnv();

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
      shortcuts: {
        nn: "create note",
        ln: "list notes",
        sn: "search notes",
      },
    },
    // Interfaces can also be explicitly configured here
    interfaces: [
      // Add Matrix interface if configured in environment
      ...(matrixInterface ? [matrixInterface] : []),
      // Add Webserver interface if website output is configured
      ...(process.env["WEBSITE_OUTPUT_DIR"]
        ? [
            {
              type: "webserver" as const,
              enabled: true,
              config: {
                distDir: process.env["WEBSITE_OUTPUT_DIR"],
                previewPort: Number(
                  process.env["WEBSITE_PREVIEW_PORT"] ?? 4321,
                ),
                productionPort: Number(
                  process.env["WEBSITE_PRODUCTION_PORT"] ?? 8080,
                ),
              },
            },
          ]
        : []),
    ],
    plugins: [
      // Directory sync plugin for file-based storage (if configured)
      ...(process.env["SYNC_PATH"]
        ? [
            directorySync({
              syncPath: process.env["SYNC_PATH"],
              watchEnabled: process.env["WATCH_ENABLED"] === "true",
              watchInterval: process.env["WATCH_INTERVAL"]
                ? Number(process.env["WATCH_INTERVAL"])
                : 5000,
            }),
          ]
        : []),
      // Site builder plugin for generating static sites
      ...(process.env["WEBSITE_OUTPUT_DIR"]
        ? [
            siteBuilderPlugin({
              outputDir: process.env["WEBSITE_OUTPUT_DIR"],
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
