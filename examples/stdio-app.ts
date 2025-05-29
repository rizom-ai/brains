import { App } from "@brains/app";

// Example of creating a stdio-based Brain app
async function main() {
  // Create app with stdio transport (default)
  const app = App.create({
    name: "brain-stdio",
    version: "1.0.0",
    dbPath: "./brain.db",
  });

  // Initialize and start
  await app.initialize();
  await app.start();

  console.error("Brain stdio server started"); // Use stderr for logs
}

main().catch((error) => {
  console.error("Failed to start:", error);
  process.exit(1);
});