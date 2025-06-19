#!/usr/bin/env bun
/**
 * Type-safe deployment wrapper for brain apps
 * Provides validation and better DX while delegating to shell scripts
 */

import { $ } from "bun";
import { existsSync } from "fs";
import { join } from "path";

// Type definitions
type Provider = "docker" | "hetzner" | "digitalocean" | "aws" | "local";
type Action = "deploy" | "update" | "destroy" | "status";

interface DeployConfig {
  name: string;
  serviceName: string;
  binaryName: string;
  defaultPort: number;
  installPath: string;
  platforms?: string[];
  deployment?: {
    preferredProvider?: Provider;
    serverSize?: Record<Provider, string>;
  };
}

interface DeployOptions {
  app: string;
  provider?: Provider;
  action?: Action;
  server?: string; // For Docker deployments
}

// Color codes for output
const colors = {
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  reset: "\x1b[0m",
};

// Helper functions
function log(message: string, color: keyof typeof colors = "reset") {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function error(message: string): never {
  log(`❌ ${message}`, "red");
  process.exit(1);
}

function success(message: string) {
  log(`✅ ${message}`, "green");
}

function info(message: string) {
  log(`ℹ️  ${message}`, "blue");
}

// Get list of available apps
async function getAvailableApps(): Promise<string[]> {
  const appsDir = join(process.cwd(), "apps");
  if (!existsSync(appsDir)) return [];

  const entries = await Bun.file(appsDir)
    .text()
    .catch(() => "");
  const proc = await $`ls -1 ${appsDir}`.quiet();
  return proc.stdout.toString().trim().split("\n").filter(Boolean);
}

// Get list of available providers
async function getAvailableProviders(): Promise<Provider[]> {
  const providersDir = join(process.cwd(), "deploy/providers");
  if (!existsSync(providersDir)) return [];

  const proc = await $`ls -1 ${providersDir}`.quiet();
  return proc.stdout
    .toString()
    .trim()
    .split("\n")
    .filter(Boolean) as Provider[];
}

// Validate app configuration
async function validateApp(appName: string): Promise<DeployConfig> {
  const configPath = join(
    process.cwd(),
    "apps",
    appName,
    "deploy/deploy.config.json",
  );

  if (!existsSync(configPath)) {
    error(`App '${appName}' is missing deploy/deploy.config.json`);
  }

  try {
    const config = (await Bun.file(configPath).json()) as DeployConfig;

    // Validate required fields
    if (!config.name || !config.serviceName || !config.binaryName) {
      error(
        `Invalid deploy.config.json for ${appName}: missing required fields`,
      );
    }

    return config;
  } catch (e) {
    error(`Failed to parse deploy.config.json for ${appName}: ${e}`);
  }
}

// Interactive mode
async function interactiveMode(): Promise<DeployOptions> {
  const apps = await getAvailableApps();
  const providers = await getAvailableProviders();

  if (apps.length === 0) {
    error("No apps found in apps/ directory");
  }

  console.log("\n🧠 Brain Deployment Tool\n");

  // Select app
  console.log("Available apps:");
  apps.forEach((app, i) => console.log(`  ${i + 1}. ${app}`));

  const appChoice = prompt("\nSelect app (number or name): ");
  const appIndex = parseInt(appChoice || "0") - 1;
  const app =
    appIndex >= 0 && appIndex < apps.length ? apps[appIndex] : appChoice;

  if (!app || !apps.includes(app)) {
    error("Invalid app selection");
  }

  // Validate app
  const config = await validateApp(app);

  // Select provider
  console.log("\nAvailable providers:");
  providers.forEach((provider, i) => console.log(`  ${i + 1}. ${provider}`));

  const defaultProvider = config.deployment?.preferredProvider || providers[0];
  const providerChoice =
    prompt(`\nSelect provider (default: ${defaultProvider}): `) ||
    defaultProvider;

  // Handle numeric selection
  const providerIndex = parseInt(providerChoice) - 1;
  const selectedProvider =
    providerIndex >= 0 && providerIndex < providers.length
      ? providers[providerIndex]
      : providerChoice;

  if (!providers.includes(selectedProvider as Provider)) {
    error("Invalid provider selection");
  }

  // Select action
  const actions: Action[] = ["deploy", "update", "status", "destroy"];
  console.log("\nAvailable actions:");
  actions.forEach((action, i) => console.log(`  ${i + 1}. ${action}`));

  const actionChoice =
    prompt("\nSelect action (default: status): ") || "status";

  // Handle numeric selection
  const actionIndex = parseInt(actionChoice) - 1;
  const selectedAction =
    actionIndex >= 0 && actionIndex < actions.length
      ? actions[actionIndex]
      : actionChoice;

  if (!actions.includes(selectedAction as Action)) {
    error("Invalid action selection");
  }

  // For Docker provider, ask for server
  let server: string | undefined;
  if (selectedProvider === "docker") {
    server = prompt("\nServer address (default: local): ") || "local";
  }

  return {
    app,
    provider: selectedProvider as Provider,
    action: selectedAction as Action,
    server,
  };
}

// Execute deployment
async function deploy(options: DeployOptions) {
  const { app, provider, action = "status" } = options;

  // Validate before running
  const config = await validateApp(app);

  // Use preferred provider if not specified
  const selectedProvider =
    provider || config.deployment?.preferredProvider || "local";

  // Show deployment plan
  console.log("\n📋 Deployment Plan:");
  console.log(`  App: ${app}`);
  console.log(`  Provider: ${selectedProvider}`);
  console.log(`  Action: ${action}`);
  console.log(`  Service: ${config.serviceName}`);
  console.log(`  Port: ${config.defaultPort}`);
  console.log();

  // Confirm destructive actions
  if (action === "destroy") {
    const confirm = prompt(
      "⚠️  This will destroy the infrastructure. Type 'yes' to confirm: ",
    );
    if (confirm !== "yes") {
      info("Cancelled");
      return;
    }
  }

  // Execute shell script
  info(`Executing ${action}...`);

  try {
    // Build command with optional server argument for Docker
    const args = [app, selectedProvider, action];
    if (selectedProvider === "docker" && options.server) {
      args.push(options.server);
    }

    const result = await $`./deploy/scripts/deploy-brain.sh ${args}`;

    if (result.exitCode === 0) {
      success(`${action} completed successfully!`);
    } else {
      error(`${action} failed with exit code ${result.exitCode}`);
    }
  } catch (e) {
    error(`Deployment failed: ${e}`);
  }
}

// Pre-flight checks
async function preflightChecks() {
  // Check if we're in the right directory
  if (!existsSync("deploy/scripts/deploy-brain.sh")) {
    error("Please run this script from the project root directory");
  }

  // Check if deploy-brain.sh is executable
  try {
    await $`test -x deploy/scripts/deploy-brain.sh`.quiet();
  } catch {
    info("Making deploy-brain.sh executable...");
    await $`chmod +x deploy/scripts/deploy-brain.sh`;
  }
}

// CLI argument parsing
async function parseArgs(): Promise<DeployOptions | null> {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    return null; // Interactive mode
  }

  if (args[0] === "--help" || args[0] === "-h") {
    console.log(`
🧠 Brain Deployment Tool

Usage:
  bun scripts/deploy.ts [app] [provider] [action] [server]
  bun scripts/deploy.ts [app] local              # Docker local deployment
  bun scripts/deploy.ts --help
  bun scripts/deploy.ts --list

Arguments:
  app       Name of the app to deploy
  provider  Deployment provider (docker, hetzner, aws, etc.)
  action    Action to perform (deploy, update, status, destroy)
  server    Server address for Docker deployments (optional, defaults to local)

Examples:
  bun scripts/deploy.ts                           # Interactive mode
  bun scripts/deploy.ts test-brain                # Deploy test-brain with defaults
  bun scripts/deploy.ts test-brain local          # Deploy to local Docker
  bun scripts/deploy.ts test-brain docker deploy  # Deploy to local Docker (explicit)
  bun scripts/deploy.ts test-brain docker deploy user@server  # Deploy to remote Docker
  bun scripts/deploy.ts test-brain hetzner        # Deploy to Hetzner
  bun scripts/deploy.ts test-brain hetzner deploy # Full command
  bun scripts/deploy.ts --list                    # List available apps

Shortcuts:
  bun deploy                                      # If configured in package.json
`);
    process.exit(0);
  }

  if (args[0] === "--list") {
    const apps = await getAvailableApps();
    const providers = await getAvailableProviders();

    console.log("\nAvailable apps:");
    apps.forEach((app) => console.log(`  - ${app}`));

    console.log("\nAvailable providers:");
    providers.forEach((provider) => console.log(`  - ${provider}`));

    process.exit(0);
  }

  // Handle special case: "local" as provider means docker deploy local
  if (args[1] === "local") {
    return {
      app: args[0],
      provider: "docker" as Provider,
      action: "deploy" as Action,
      server: "local",
    };
  }

  // Standard parsing
  const options: DeployOptions = {
    app: args[0],
    provider: args[1] as Provider,
    action: (args[2] as Action) || "deploy",
  };

  // For Docker, check if there's a server argument
  if (options.provider === "docker" && args[3]) {
    options.server = args[3];
  }

  return options;
}

// Main execution
async function main() {
  try {
    await preflightChecks();

    const options = await parseArgs();

    if (!options) {
      // Interactive mode
      const selected = await interactiveMode();
      await deploy(selected);
    } else {
      // Direct mode
      await deploy(options);
    }
  } catch (e) {
    error(`Unexpected error: ${e}`);
  }
}

// Run if executed directly
if (import.meta.main) {
  main();
}

// Export for programmatic use
export { deploy, validateApp, type DeployConfig, type DeployOptions };
