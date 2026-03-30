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

  // Dynamically import App to avoid circular dependency
  const { App } = await import("./app");

  // Handle CLI commands
  if (args.includes("--help") || args.includes("-h")) {
    showHelp(config);
  } else if (args.includes("--version") || args.includes("-v")) {
    console.log(`${config.name} v${config.version}`);
    process.exit(0);
  } else if (args.includes("--list-cli-commands")) {
    // List CLI-enabled tools for dynamic help
    await listCliCommands(config, App);
  } else if (args.includes("--cli-command")) {
    // Headless mode via CLI command name: boot, find tool by cli.name, invoke, exit
    await runCliCommand(config, args, App);
  } else if (args.includes("--tool")) {
    // Raw tool invocation: boot, invoke by full tool name, exit
    await runTool(config, args, App);
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
 * List all CLI-enabled tools. Used by brain --help to discover available commands.
 */
async function listCliCommands(
  config: AppConfig,
  App: { create: typeof import("./app").App.create },
): Promise<void> {
  // Force all logging to stderr so stdout is clean for command listing
  const { Logger } = await import("@brains/utils");
  Logger.getInstance().setUseStderr(true);

  const headlessConfig: AppConfig = {
    ...config,
    plugins: (config.plugins ?? []).filter((p) => p.type !== "interface"),
  };

  const app = App.create(headlessConfig);
  await app.initialize({ registerOnly: true });

  const cliTools = app.getShell().getMCPService().getCliTools();
  for (const { tool } of cliTools) {
    if (tool.cli) {
      console.log(`${tool.cli.name.padEnd(16)}${tool.description}`);
    }
  }

  process.exit(0);
}

/**
 * Headless mode via CLI command name: boot brain, find tool by cli.name, invoke, exit.
 *
 * Used by `brain list`, `brain sync`, etc. The brain CLI passes the command
 * name and args/flags as JSON. This function discovers the matching tool
 * via getCliTools() and invokes it.
 */
async function runCliCommand(
  config: AppConfig,
  args: string[],
  App: { create: typeof import("./app").App.create },
): Promise<void> {
  // Force all logging to stderr so stdout is clean for command output
  const { Logger } = await import("@brains/utils");
  Logger.getInstance().setUseStderr(true);

  const cmdIdx = args.indexOf("--cli-command");
  const commandName = args[cmdIdx + 1];
  if (commandName === undefined) {
    console.error("❌ --cli-command requires a command name");
    process.exit(1);
  }

  const argsIdx = args.indexOf("--cli-args");
  const argsJson = argsIdx !== -1 ? args[argsIdx + 1] : undefined;
  const cliArgs: string[] = argsJson ? (JSON.parse(argsJson) as string[]) : [];

  const flagsIdx = args.indexOf("--cli-flags");
  const flagsJson = flagsIdx !== -1 ? args[flagsIdx + 1] : undefined;
  const cliFlags: Record<string, unknown> = flagsJson
    ? (JSON.parse(flagsJson) as Record<string, unknown>)
    : {};

  // Boot headless (no interfaces)
  const headlessConfig: AppConfig = {
    ...config,
    plugins: (config.plugins ?? []).filter((p) => p.type !== "interface"),
  };

  const app = App.create(headlessConfig);
  await app.initialize();

  const shell = app.getShell();
  const cliTools = shell.getMCPService().getCliTools();
  const match = cliTools.find((t) => t.tool.cli?.name === commandName);

  if (!match?.tool.cli) {
    const available = cliTools
      .map((t) => t.tool.cli?.name)
      .filter(Boolean)
      .join(", ");
    console.error(`❌ Unknown command: ${commandName}`);
    console.error(`Available commands: ${available}`);
    process.exit(1);
  }

  const { mapArgsToInput } = await import("@brains/mcp-service");
  const toolInput = mapArgsToInput(match.tool.inputSchema, cliArgs, cliFlags);

  try {
    const result = await match.tool.handler(toolInput, {
      interfaceType: "cli",
      userId: "cli-anchor",
    });

    if ("needsConfirmation" in result) {
      console.log(`Confirmation needed: ${result.description}`);
      process.exit(0);
    }

    if (!result.success) {
      console.error(`❌ ${result.error}`);
      process.exit(1);
    }

    if (result.message) {
      console.log(result.message);
    }
    if (result.data !== undefined) {
      console.log(
        typeof result.data === "string"
          ? result.data
          : JSON.stringify(result.data, null, 2),
      );
    }
  } catch (error) {
    console.error(
      `❌ Command ${commandName} failed:`,
      error instanceof Error ? error.message : error,
    );
    process.exit(1);
  }

  process.exit(0);
}

/**
 * Headless mode: boot brain without daemons, invoke a tool, print result, exit.
 *
 * Used by `brain list`, `brain get`, `brain sync`, etc.
 * Skips all interface plugins (MCP, Discord, webserver) — only loads
 * entity plugins and service plugins.
 */
async function runTool(
  config: AppConfig,
  args: string[],
  App: { create: typeof import("./app").App.create },
): Promise<void> {
  // Force all logging to stderr so stdout is clean for tool output
  const { Logger } = await import("@brains/utils");
  Logger.getInstance().setUseStderr(true);

  const toolIdx = args.indexOf("--tool");
  const toolName: string | undefined = args[toolIdx + 1];
  if (toolName === undefined) {
    console.error("❌ --tool requires a tool name");
    process.exit(1);
  }

  const inputIdx = args.indexOf("--tool-input");
  const inputJson = inputIdx !== -1 ? args[inputIdx + 1] : undefined;
  let toolInput: Record<string, unknown> = {};
  if (inputJson) {
    try {
      toolInput = JSON.parse(inputJson) as Record<string, unknown>;
    } catch {
      console.error("❌ --tool-input must be valid JSON");
      process.exit(1);
    }
  }

  // Strip all interfaces from config to prevent daemons from starting
  const headlessConfig: AppConfig = {
    ...config,
    plugins: (config.plugins ?? []).filter((p) => p.type !== "interface"),
  };

  const app = App.create(headlessConfig);
  await app.initialize();

  const shell = app.getShell();
  const mcpService = shell.getMCPService();
  const tools = mcpService.listTools();
  const match = tools.find((t) => t.tool.name === toolName);

  if (!match) {
    console.error(`❌ Tool not found: ${toolName}`);
    console.error(
      `Available tools: ${tools.map((t) => t.tool.name).join(", ")}`,
    );
    process.exit(1);
  }

  try {
    const result = await match.tool.handler(toolInput, {
      interfaceType: "cli",
      userId: "cli-anchor",
    });

    if ("needsConfirmation" in result) {
      console.log(`Confirmation needed: ${result.description}`);
      process.exit(0);
    }

    if (!result.success) {
      console.error(`❌ ${result.error}`);
      process.exit(1);
    }

    // Print data as formatted JSON or message
    if (result.message) {
      console.log(result.message);
    }
    if (result.data !== undefined) {
      console.log(
        typeof result.data === "string"
          ? result.data
          : JSON.stringify(result.data, null, 2),
      );
    }
  } catch (error) {
    console.error(
      `❌ Tool ${toolName} failed:`,
      error instanceof Error ? error.message : error,
    );
    process.exit(1);
  }

  process.exit(0);
}

/**
 * Show help information
 */
function showHelp(config: AppConfig): void {
  console.log(`
${config.name} v${config.version}

Usage:
  brains [options]

Options:
  --help, -h              Show this help message
  --version, -v           Show version information
  --cli                   Enable CLI interface (passed to app)
  --export-deploy-config  Export deployment config as JSON (for deploy scripts)

Examples:
  brains                      # Start the app
  brains --cli                # Start with CLI interface
  brains --export-deploy-config  # Output deployment JSON
`);
  process.exit(0);
}
