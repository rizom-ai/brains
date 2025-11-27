import type { AppConfig, DeploymentConfigInput } from "./types";

/**
 * Export deployment config as JSON for shell scripts
 * This is used by deploy scripts to extract config without starting the app
 */
function exportDeployConfig(config: AppConfig): void {
  const deployment: DeploymentConfigInput = config.deployment ?? {};

  const deployConfig = {
    name: config.name,
    version: config.version,
    // Server
    provider: deployment.provider ?? "hetzner",
    serverSize: deployment.serverSize ?? "cx33",
    location: deployment.location ?? "fsn1",
    domain: deployment.domain,
    // Docker
    docker: {
      enabled: deployment.docker?.enabled ?? true,
      image: deployment.docker?.image ?? config.name,
    },
    // Ports
    ports: {
      default: deployment.ports?.default ?? 3333,
      preview: deployment.ports?.preview ?? 4321,
      production: deployment.ports?.production ?? 8080,
    },
    // CDN
    cdn: {
      enabled: deployment.cdn?.enabled ?? false,
      provider: deployment.cdn?.provider ?? "none",
    },
    // DNS
    dns: {
      enabled: deployment.dns?.enabled ?? false,
      provider: deployment.dns?.provider ?? "none",
    },
    // Paths (compute defaults based on app name)
    paths: {
      install: deployment.paths?.install ?? `/opt/${config.name}`,
      data: deployment.paths?.data ?? `/opt/${config.name}/data`,
    },
  };

  console.log(JSON.stringify(deployConfig, null, 2));
  process.exit(0);
}

/**
 * Validate deployment credentials when CDN/DNS is enabled
 */
function validateDeploymentCredentials(config: AppConfig): void {
  const { cdn, dns } = config.deployment ?? {};

  if (cdn?.enabled && cdn?.provider === "bunny") {
    if (!process.env["BUNNY_API_KEY"]) {
      console.error(
        "❌ CDN enabled with Bunny provider but BUNNY_API_KEY is not set",
      );
      process.exit(1);
    }
  }

  if (dns?.enabled && dns?.provider === "bunny") {
    if (!process.env["BUNNY_API_KEY"]) {
      console.error(
        "❌ DNS enabled with Bunny provider but BUNNY_API_KEY is not set",
      );
      process.exit(1);
    }
  }
}

/**
 * Handle CLI arguments and run appropriate commands
 * This should be called from brain.config.ts files when they're run directly
 */
export async function handleCLI(config: AppConfig): Promise<void> {
  const args = process.argv.slice(2);

  // Handle --export-deploy-config first (no app startup needed)
  if (args.includes("--export-deploy-config")) {
    exportDeployConfig(config);
    return; // exportDeployConfig calls process.exit
  }

  // Set up error handling
  process.on("uncaughtException", (error) => {
    console.error(`❌ ${config.name} crashed:`, error);
    process.exit(1);
  });

  process.on("unhandledRejection", (reason) => {
    console.error(`❌ ${config.name} unhandled rejection:`, reason);
    process.exit(1);
  });

  // Validate credentials before starting app
  validateDeploymentCredentials(config);

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
  --help, -h              Show this help message
  --version, -v           Show version information
  --cli                   Enable CLI interface (passed to app)
  --export-deploy-config  Export deployment config as JSON (for deploy scripts)

Examples:
  bun brain.config.ts                      # Start the app
  bun brain.config.ts --cli                # Start with CLI interface
  bun brain.config.ts --export-deploy-config  # Output deployment JSON
`);
  process.exit(0);
}
