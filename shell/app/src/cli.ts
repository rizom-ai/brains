import { z } from "@brains/utils/zod";
import type { AppConfig } from "./types";
import type { App as AppClass, AppRuntimeOptions } from "./app";
import type { ActorRef } from "@brains/contracts";
import type { ToolResponse } from "@brains/mcp-service";
import { getErrorMessage } from "@brains/utils/error";

export interface AppFactory {
  create: typeof AppClass.create;
  run: typeof AppClass.run;
}

/**
 * Everything handleCLI touches outside its arguments.
 *
 * Production wires this to the process and console. A test hands in a fake
 * and reads outcomes off it — what was printed, what exit code — instead of
 * patching globals and restoring them afterwards. `exit` is typed `never` so
 * a fake must throw rather than return; a fake that returned would let code
 * run on past an exit into states the real process never reaches.
 */
export interface CliIo {
  argv: readonly string[];
  log: (line: string) => void;
  error: (line: string, ...detail: unknown[]) => void;
  exit: (code: number) => never;
  app: AppFactory;
}

type InitializeOptions = Parameters<
  ReturnType<typeof AppClass.create>["initialize"]
>[0];

async function productionIo(config: AppConfig): Promise<CliIo> {
  // Imported here rather than at the top to avoid a circular dependency.
  const { App } = await import("./app");

  process.on("uncaughtException", (error) => {
    console.error(`❌ ${config.name} crashed:`, error);
    process.exit(1);
  });
  process.on("unhandledRejection", (reason) => {
    console.error(`❌ ${config.name} unhandled rejection:`, reason);
    process.exit(1);
  });

  return {
    argv: process.argv.slice(2),
    log: console.log,
    error: console.error,
    exit: process.exit,
    app: App,
  };
}

function getArgValue(
  args: readonly string[],
  flag: string,
): string | undefined {
  const flagIdx = args.indexOf(flag);
  return flagIdx !== -1 ? args[flagIdx + 1] : undefined;
}

function requireArgValue(io: CliIo, flag: string, message: string): string {
  const value = getArgValue(io.argv, flag);
  if (value === undefined) {
    io.error(message);
    io.exit(1);
  }
  return value;
}

interface JsonFlagSchema<T> {
  parse(value: unknown): T;
}

const cliArgsSchema = z.array(z.string());
const cliFlagsSchema = z.record(z.string(), z.unknown());
const jsonValueSchema = z.unknown();

function parseJsonFlag<T>(
  args: readonly string[],
  flag: string,
  defaultValue: T,
  schema: JsonFlagSchema<T>,
): T {
  const value = getArgValue(args, flag);
  return value ? schema.parse(JSON.parse(value)) : defaultValue;
}

function createHeadlessConfig(config: AppConfig): AppConfig {
  return {
    ...config,
    plugins: (config.plugins ?? []).filter((p) => p.type !== "interface"),
  };
}

async function routeLogsToStderr(): Promise<void> {
  const { ConsoleLogger } = await import("@brains/utils/logger");
  ConsoleLogger.getInstance().setUseStderr(true);
}

async function initializeHeadlessApp(
  config: AppConfig,
  io: CliIo,
  options?: InitializeOptions,
): Promise<ReturnType<typeof AppClass.create>> {
  await routeLogsToStderr();

  const app = io.app.create(createHeadlessConfig(config));
  await app.initialize(options);
  return app;
}

function printToolResult(io: CliIo, result: ToolResponse): void {
  if ("needsConfirmation" in result) {
    const detail = result.preview ? `\n\n${result.preview}` : "";
    io.log(`Confirmation needed: ${result.summary}${detail}`);
    io.exit(0);
  }

  if (!result.success) {
    io.error(`❌ ${result.error}`);
    io.exit(1);
  }

  if (result.message) {
    io.log(result.message);
  }
  if (result.data !== undefined) {
    io.log(
      typeof result.data === "string"
        ? result.data
        : JSON.stringify(result.data, null, 2),
    );
  }
}

async function invokeCliTool(
  io: CliIo,
  handler: (
    input: unknown,
    context: { interfaceType: string; actor: ActorRef },
  ) => Promise<ToolResponse>,
  input: unknown,
  failureLabel: string,
): Promise<void> {
  // Only the handler call is guarded. Reporting is deliberately outside: a
  // failure while printing — serializing circular `data`, say — is not the
  // tool failing, and labelling it as one hides where it went wrong.
  let result: ToolResponse;
  try {
    result = await handler(input, {
      interfaceType: "cli",
      actor: { kind: "service", serviceId: "shell-cli" },
    });
  } catch (error) {
    io.error(`❌ ${failureLabel} failed:`, getErrorMessage(error));
    io.exit(1);
  }
  printToolResult(io, result);
}

/**
 * Export deployment config as JSON for shell scripts
 * This is used by deploy scripts to extract config without starting the app
 */
function exportDeployConfig(io: CliIo, config: AppConfig): void {
  const deployment = config.deployment;

  const deployConfig = {
    name: config.name,
    version: config.version,
    // Server
    provider: deployment.provider,
    serverSize: deployment.serverSize,
    location: deployment.location,
    domain: deployment.domain,
    // Docker
    docker: {
      enabled: deployment.docker.enabled,
      image: deployment.docker.image ?? config.name,
    },
    // Ports
    ports: {
      default: deployment.ports.default,
      preview: deployment.ports.preview,
      production: deployment.ports.production,
    },
    // CDN
    cdn: {
      enabled: deployment.cdn.enabled,
      provider: deployment.cdn.provider,
    },
    // DNS
    dns: {
      enabled: deployment.dns.enabled,
      provider: deployment.dns.provider,
    },
    // Paths (compute defaults based on app name)
    paths: {
      install: deployment.paths.install ?? `/opt/${config.name}`,
      data: deployment.paths.data ?? `/opt/${config.name}/data`,
    },
  };

  io.log(JSON.stringify(deployConfig, null, 2));
  io.exit(0);
}

/**
 * Handle CLI arguments and run appropriate commands from a generated brain entrypoint.
 */
export async function handleCLI(
  config: AppConfig,
  runtimeOptions?: AppRuntimeOptions,
  io?: CliIo,
): Promise<void> {
  const cli = io ?? (await productionIo(config));
  const args = cli.argv;

  // Handle --export-deploy-config first (no app startup needed)
  if (args.includes("--export-deploy-config")) {
    exportDeployConfig(cli, config);
  }

  // Handle CLI commands
  if (args.includes("--help") || args.includes("-h")) {
    showHelp(cli, config);
  } else if (args.includes("--version") || args.includes("-v")) {
    cli.log(`${config.name} v${config.version}`);
    cli.exit(0);
  } else if (args.includes("--startup-check")) {
    // Startup check: register plugins and run ready hooks, but do not start
    // daemons or job workers. Used by external plugin smoke tests.
    const app = cli.app.create(config);
    await app.initialize({ mode: "startup-check" });
    await app.stop();
  } else if (args.includes("--list-cli-commands")) {
    // List CLI-enabled tools for dynamic help
    await listCliCommands(cli, config);
  } else if (args[0] === "diagnostics") {
    // Diagnostics mode: boot brain, run diagnostics, exit
    await runDiagnostics(cli, config, args.slice(1));
  } else if (args.includes("--cli-command")) {
    // Headless mode via CLI command name: boot, find tool by cli.name, invoke, exit
    await runCliCommand(cli, config);
  } else if (args.includes("--tool")) {
    // Raw tool invocation: boot, invoke by full tool name, exit
    await runTool(cli, config);
  } else {
    // Default: run the app
    cli.log(`🚀 Starting ${config.name} v${config.version}...`);
    if (runtimeOptions) {
      await cli.app.run(config, undefined, runtimeOptions);
    } else {
      await cli.app.run(config);
    }
  }
}

/**
 * List all CLI-enabled tools. Used by brain --help to discover available commands.
 */
async function listCliCommands(io: CliIo, config: AppConfig): Promise<void> {
  const app = await initializeHeadlessApp(config, io, {
    mode: "register-only",
  });

  const cliTools = app.getShell().getMCPService().getCliTools();
  for (const { tool } of cliTools) {
    if (tool.cli) {
      io.log(`${tool.cli.name.padEnd(16)}${tool.description}`);
    }
  }

  io.exit(0);
}

/**
 * Headless mode via CLI command name: boot brain, find tool by cli.name, invoke, exit.
 *
 * Used by `brain list`, `brain sync`, etc. The brain CLI passes the command
 * name and args/flags as JSON. This function discovers the matching tool
 * via getCliTools() and invokes it.
 */
async function runCliCommand(io: CliIo, config: AppConfig): Promise<void> {
  const commandName = requireArgValue(
    io,
    "--cli-command",
    "❌ --cli-command requires a command name",
  );
  const cliArgs = parseJsonFlag(io.argv, "--cli-args", [], cliArgsSchema);
  const cliFlags = parseJsonFlag(io.argv, "--cli-flags", {}, cliFlagsSchema);

  const app = await initializeHeadlessApp(config, io);
  const cliTools = app.getShell().getMCPService().getCliTools();
  const match = cliTools.find((t) => t.tool.cli?.name === commandName);

  if (!match?.tool.cli) {
    const available = cliTools
      .map((t) => t.tool.cli?.name)
      .filter(Boolean)
      .join(", ");
    io.error(`❌ Unknown command: ${commandName}`);
    io.error(`Available commands: ${available}`);
    io.exit(1);
  }

  const { mapArgsToInput } = await import("@brains/mcp-service");
  const toolInput = mapArgsToInput(match.tool.inputSchema, cliArgs, cliFlags);
  await invokeCliTool(
    io,
    match.tool.handler,
    toolInput,
    `Command ${commandName}`,
  );

  io.exit(0);
}

/**
 * Headless mode: boot brain without daemons, invoke a tool, print result, exit.
 *
 * Used by `brain list`, `brain get`, `brain sync`, etc.
 * Skips all interface plugins (MCP, Discord, webserver) — only loads
 * entity plugins and service plugins.
 */
async function runTool(io: CliIo, config: AppConfig): Promise<void> {
  const toolName = requireArgValue(
    io,
    "--tool",
    "❌ --tool requires a tool name",
  );

  let toolInput: unknown = {};
  try {
    toolInput = parseJsonFlag(io.argv, "--tool-input", {}, jsonValueSchema);
  } catch {
    io.error("❌ --tool-input must be valid JSON");
    io.exit(1);
  }

  const app = await initializeHeadlessApp(config, io);
  const tools = app.getShell().getMCPService().listTools();
  const match = tools.find((t) => t.tool.name === toolName);

  if (!match) {
    io.error(`❌ Tool not found: ${toolName}`);
    io.error(`Available tools: ${tools.map((t) => t.tool.name).join(", ")}`);
    io.exit(1);
  }

  await invokeCliTool(io, match.tool.handler, toolInput, `Tool ${toolName}`);

  io.exit(0);
}

/**
 * Run diagnostics: boot brain (full, with daemons disabled), analyze, exit.
 */
async function runDiagnostics(
  io: CliIo,
  config: AppConfig,
  args: readonly string[],
): Promise<void> {
  const { ConsoleLogger, LogLevel } = await import("@brains/utils/logger");
  // Suppress plugin registration noise — only show warnings and errors
  ConsoleLogger.resetInstance();
  ConsoleLogger.getInstance({ level: LogLevel.WARN, useStderr: true });

  const subcommand = args[0] ?? "";

  if (subcommand === "usage") {
    await runUsageDiagnostics(io, config);
    return;
  }

  if (subcommand !== "search") {
    io.error("Usage: brain diagnostics <search|usage>");
    io.exit(1);
  }

  // Boot in register-only mode — no daemons, no sync, no builds.
  // We only need access to the existing entity + embedding data.
  const app = io.app.create(createHeadlessConfig(config));
  await app.initialize({ mode: "register-only" });

  const shell = app.getShell();
  const entityService = shell.getEntityService();
  await entityService.initialize();

  const entityTypes = entityService.getEntityTypes();
  const allEntities: Array<{ id: string; entityType: string; title: string }> =
    [];

  const entityLists = await Promise.all(
    entityTypes.map((type) =>
      entityService.listEntities({
        entityType: type,
        options: { limit: 100 },
      }),
    ),
  );
  for (const entities of entityLists) {
    for (const entity of entities) {
      const meta = cliFlagsSchema.parse(entity.metadata);
      const title = String(meta["title"] ?? meta["name"] ?? entity.id);
      allEntities.push({ id: entity.id, entityType: entity.entityType, title });
    }
  }

  if (allEntities.length === 0) {
    await shell.shutdown();
    io.error("No entities found");
    io.exit(1);
  }

  io.log(`\nAnalyzing ${allEntities.length} entities...\n`);

  const sampleSize = Math.min(20, allEntities.length);
  const samples = allEntities
    .sort(() => Math.random() - 0.5)
    .slice(0, sampleSize);

  const allDistances: number[] = [];
  const selfDistances: number[] = [];

  const searchResults = await Promise.all(
    samples.map((s) => entityService.searchWithDistances({ query: s.title })),
  );
  for (const [i, sample] of samples.entries()) {
    for (const r of searchResults[i] ?? []) {
      allDistances.push(r.distance);
      if (r.entityId === sample.id && r.entityType === sample.entityType) {
        selfDistances.push(r.distance);
      }
    }
  }

  allDistances.sort((a, b) => a - b);
  selfDistances.sort((a, b) => a - b);

  const pct = (arr: number[], p: number): number => {
    if (arr.length === 0) return 0;
    const idx = Math.ceil((p / 100) * arr.length) - 1;
    return arr[Math.max(0, idx)] ?? 0;
  };

  io.log("=== Search Distance Distribution ===\n");
  io.log(`Queries sampled: ${samples.length}`);
  io.log(`Total distance measurements: ${allDistances.length}`);
  io.log(`Self-match distances: ${selfDistances.length}\n`);

  io.log("All distances:");
  for (const p of [0, 25, 50, 75, 90, 95, 100]) {
    const label = p === 0 ? "min" : p === 100 ? "max" : `p${p}`;
    io.log(`  ${label.padEnd(5)} ${pct(allDistances, p).toFixed(4)}`);
  }

  io.log("\nSelf-match distances (query = entity title):");
  io.log(`  min:  ${pct(selfDistances, 0).toFixed(4)}`);
  io.log(`  p50:  ${pct(selfDistances, 50).toFixed(4)}`);
  io.log(`  max:  ${pct(selfDistances, 100).toFixed(4)}\n`);

  const p75 = pct(allDistances, 75);
  const p90 = pct(allDistances, 90);
  const suggested = Number(((p75 + p90) / 2).toFixed(4));

  io.log(`Current threshold: 0.82`);
  io.log(`Suggested threshold: ${suggested}`);
  io.log(
    `  (midpoint between p75=${p75.toFixed(4)} and p90=${p90.toFixed(4)})\n`,
  );

  await shell.shutdown();
  io.exit(0);
}

/**
 * Run usage diagnostics: read the log file, aggregate ai:usage events.
 */
async function runUsageDiagnostics(
  io: CliIo,
  config: AppConfig,
): Promise<void> {
  const logFile = config.logFile;
  if (!logFile) {
    io.error(
      "No log file configured. Set logFile in brain.yaml to enable usage tracking.",
    );
    io.exit(1);
  }

  const { existsSync, readFileSync } = await import("node:fs");
  if (!existsSync(logFile)) {
    io.error(`Log file not found: ${logFile}`);
    io.exit(1);
  }

  const { aggregateUsage } = await import("./usage-aggregator");
  const content = readFileSync(logFile, "utf-8");
  const report = aggregateUsage(content);

  if (report.events.length === 0) {
    io.log("No ai:usage events found in log file.");
    io.exit(0);
  }

  const total = report.totalInputTokens + report.totalOutputTokens;

  io.log("=== AI Usage ===\n");
  io.log(`Period: ${report.firstTs} → ${report.lastTs}`);
  io.log(`Total events: ${report.events.length}`);
  io.log(`Total input tokens:  ${report.totalInputTokens.toLocaleString()}`);
  io.log(`Total output tokens: ${report.totalOutputTokens.toLocaleString()}`);
  io.log(`Total tokens:        ${total.toLocaleString()}\n`);

  io.log("By model:");
  for (const [key, agg] of report.byModel.entries()) {
    io.log(
      `  ${key.padEnd(40)} ${String(agg.calls).padStart(5)} calls, ` +
        `${agg.inputTokens.toLocaleString().padStart(12)} in, ` +
        `${agg.outputTokens.toLocaleString().padStart(12)} out`,
    );
  }

  io.exit(0);
}

/**
 * Show help information
 */
function showHelp(io: CliIo, config: AppConfig): void {
  io.log(`
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
  io.exit(0);
}
