import { App } from "@brains/app";

// Example of creating an HTTP-based Brain app
async function main() {
  // Create app with HTTP transport
  const app = App.create({
    name: "brain-http",
    version: "1.0.0",
    transport: {
      type: "http",
      port: 8080,
      host: "localhost",
    },
    dbPath: "./brain.db",
    shellConfig: {
      logging: {
        level: "info",
        context: "brain-http",
      },
    },
  });

  // Initialize and start
  await app.initialize();
  await app.start();

  console.log("Brain HTTP server started at http://localhost:8080/mcp");
}

main().catch((error) => {
  console.error("Failed to start:", error);
  process.exit(1);
});