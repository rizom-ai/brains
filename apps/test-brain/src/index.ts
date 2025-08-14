import { App } from "@brains/app";
import { SystemPlugin } from "@brains/system";
import { MCPInterface } from "@brains/mcp";
import { MatrixInterface } from "@brains/matrix";
import { directorySync } from "@brains/directory-sync";
import { WebserverInterface } from "@brains/webserver";
import { siteBuilderPlugin } from "@brains/site-builder-plugin";
import { templates, routes } from "@brains/default-site-content";

// Simple configuration - shell/core handles the standard paths
async function main(): Promise<void> {
  await App.run({
    name: "test-brain",
    version: "1.0.0",
    aiApiKey: process.env["ANTHROPIC_API_KEY"],
    plugins: [
      new SystemPlugin({}),
      new MCPInterface({}),
      new MatrixInterface({
        homeserver: "https://matrix.rizom.ai",
        accessToken: process.env["MATRIX_ACCESS_TOKEN"] || "",
        userId: "@testbrain-dev:rizom.ai",
        anchorUserId: "@yeehaa:rizom.ai",
      }),
      directorySync({}),
      new WebserverInterface({}),
      siteBuilderPlugin({
        templates,
        routes,
      }),
    ],
  });
}

main().catch((error) => {
  console.error("Failed to start app:", error);
  process.exit(1);
});
