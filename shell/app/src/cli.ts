import type { AppConfig } from "./types";

/**
 * Handle CLI arguments and run appropriate commands
 * This should be called from brain.config.ts files when they're run directly
 */
export async function handleCLI(config: AppConfig): Promise<void> {
  const args = process.argv.slice(2);

  // Set up error handling
  process.on("uncaughtException", (error) => {
    console.error(`❌ ${config.name} crashed:`, error);
    process.exit(1);
  });

  process.on("unhandledRejection", (reason) => {
    console.error(`❌ ${config.name} unhandled rejection:`, reason);
    process.exit(1);
  });

  // Dynamically import App to avoid circular dependency
  const { App } = await import("./app");

  // Handle CLI commands
  if (args.includes("--help") || args.includes("-h")) {
    showHelp(config);
  } else if (args.includes("--version") || args.includes("-v")) {
    console.log(`${config.name} v${config.version}`);
    process.exit(0);
  } else {
    // Default: run the app
    console.log(`🚀 Starting ${config.name} v${config.version}...`);
    App.run(config).catch((error) => {
      console.error(`❌ Failed to start ${config.name}:`, error);
      process.exit(1);
    });
  }
}

/**
 * Show help information
 */
function showHelp(config: AppConfig): void {
  console.log(`
${config.name} v${config.version}

Usage:
  bun brain.config.ts [options]

Options:
  --help, -h        Show this help message
  --version, -v     Show version information
  --cli             Enable CLI interface (passed to app)

Examples:
  bun brain.config.ts           # Start the app
  bun brain.config.ts --migrate # Run migrations
  bun brain.config.ts --cli     # Start with CLI interface
`);
  process.exit(0);
}
