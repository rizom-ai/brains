import { existsSync } from "fs";
import { join } from "path";
import { spawn } from "child_process";
import type { CommandResult } from "../lib/command-result";
import type { BootedBrain } from "../lib/boot";
import type { ToolResponse } from "@brains/mcp-service";
import type { UserPermissionLevel } from "@brains/templates";
import { findRunner, resolveRunnerType } from "./start";
import { parseBrainYaml } from "../lib/brain-yaml";
import { getErrorMessage } from "@brains/utils/error";
import { loadDefinition } from "../lib/definition-registry";

/**
 * Run a CLI command via the brain's tool registry.
 *
 * Two paths:
 * 1. Monorepo: spawns runner with --cli-command
 * 2. Builtin: boots in-process, invokes tool, prints result, exits
 */
export async function operate(
  cwd: string,
  commandName: string,
  args: string[],
  flags: Record<string, unknown>,
): Promise<CommandResult> {
  if (!existsSync(join(cwd, "brain.yaml"))) {
    return {
      success: false,
      message: `No brain.yaml found in ${cwd}. Run 'brain init <dir>' first.`,
    };
  }

  const runnerType = resolveRunnerType(cwd);

  // Builtin: in-process boot
  if (runnerType === "builtin") {
    return operateBuiltin(cwd, commandName, args, flags);
  }

  // Monorepo: subprocess
  if (runnerType === "monorepo") {
    return operateSubprocess(cwd, commandName, args, flags);
  }

  return {
    success: false,
    message:
      "Could not find brain runner. Install @rizom/brain globally or run from the monorepo.",
  };
}

/**
 * Boot the bundled runtime in register-only mode — no daemons, no events.
 * A register-only boot always returns the App, so a missing brain means the
 * entrypoint's boot function did not honour the mode it was given.
 */
async function bootRegisterOnly(
  cwd: string,
): Promise<{ brain: BootedBrain } | { failure: CommandResult }> {
  const config = parseBrainYaml(cwd);
  const definition = await loadDefinition(config.brain);
  const { bootBrain } = await import("../lib/boot");
  const brain = await bootBrain(cwd, definition, {
    chat: false,
    mode: "register-only",
  });
  if (!brain) {
    return {
      failure: {
        success: false,
        message: "Boot did not return a brain; cannot run CLI commands.",
      },
    };
  }
  return { brain };
}

/** Print a tool result and translate it into the shared command result. */
function printToolResult(
  result: ToolResponse,
  onConfirmation: CommandResult,
): CommandResult {
  if ("needsConfirmation" in result) {
    const detail = result.preview ? `\n\n${result.preview}` : "";
    console.log(`Confirmation needed: ${result.summary}${detail}`);
    return onConfirmation;
  }

  if (!result.success) {
    console.error(`❌ ${result.error}`);
    return { success: false, message: result.error };
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

  return { success: true };
}

/**
 * In-process operate: boot brain, find tool by CLI name, invoke, print, exit.
 */
async function operateBuiltin(
  cwd: string,
  commandName: string,
  args: string[],
  flags: Record<string, unknown>,
): Promise<CommandResult> {
  try {
    const booted = await bootRegisterOnly(cwd);
    if ("failure" in booted) return booted.failure;
    const mcpService = booted.brain.getShell().getMCPService();
    const cliTools = mcpService.getCliTools();
    const match = cliTools.find((t) => t.tool.cli?.name === commandName);

    if (!match?.tool.cli) {
      const available = cliTools
        .map((t) => t.tool.cli?.name)
        .filter(Boolean)
        .join(", ");
      return {
        success: false,
        message: `Unknown command: ${commandName}. Available: ${available}`,
      };
    }

    const { mapArgsToInput } = await import("@brains/mcp-service");
    const toolInput = mapArgsToInput(match.tool.inputSchema, args, flags);

    const result = await match.tool.handler(toolInput, {
      interfaceType: "cli",
      actor: { kind: "service", serviceId: "brain-cli" },
      userPermissionLevel: "admin",
    });

    return printToolResult(result, { success: true });
  } catch (error) {
    return {
      success: false,
      message: getErrorMessage(error, "Operation failed"),
    };
  }
}

/** Invoke an exact tool name with structured input in the bundled runtime. */
export async function operateRawTool(
  cwd: string,
  toolName: string,
  input: unknown,
  options: {
    readonly confirm?: boolean | undefined;
    readonly permission?: UserPermissionLevel | undefined;
  } = {},
): Promise<CommandResult> {
  if (!existsSync(join(cwd, "brain.yaml"))) {
    return {
      success: false,
      message: `No brain.yaml found in ${cwd}. Run 'brain init <dir>' first.`,
    };
  }
  if (resolveRunnerType(cwd) !== "builtin") {
    return {
      success: false,
      message: "Raw bundled tool invocation is unavailable in this runtime.",
    };
  }

  let bootedBrain: BootedBrain | undefined;
  try {
    const booted = await bootRegisterOnly(cwd);
    if ("failure" in booted) return booted.failure;
    bootedBrain = booted.brain;

    const mcpService = bootedBrain.getShell().getMCPService();
    const tools = mcpService.listTools();
    const match = tools.find(({ tool }) => tool.name === toolName);
    if (!match) {
      return {
        success: false,
        message: `Tool not found: ${toolName}. Available: ${tools
          .map(({ tool }) => tool.name)
          .join(", ")}`,
      };
    }

    const context = {
      interfaceType: "cli",
      actor: { kind: "service" as const, serviceId: "brain-cli" },
      userPermissionLevel: options.permission ?? "admin",
    };
    let result = await match.tool.handler(input, context);
    if ("needsConfirmation" in result && options.confirm) {
      result = await match.tool.handler(result.args, context);
    }

    return printToolResult(result, {
      success: false,
      message: "Confirmation required; rerun with --yes.",
    });
  } catch (error) {
    return {
      success: false,
      message: getErrorMessage(error, "Raw tool operation failed"),
    };
  } finally {
    await bootedBrain?.stop?.();
  }
}

/**
 * Subprocess operate: spawn runner with --cli-command flags.
 */
async function operateSubprocess(
  cwd: string,
  commandName: string,
  args: string[],
  flags: Record<string, unknown>,
): Promise<CommandResult> {
  const runner = findRunner(cwd);
  if (!runner) {
    return {
      success: false,
      message: "Could not find brain runner.",
    };
  }

  // The runner can own service descendants; do not leave them behind if this
  // short-lived CLI parent disappears before it receives the close event.
  const runnerArgs = [
    "--no-orphans",
    "run",
    runner.path,
    "--cli-command",
    commandName,
    "--cli-args",
    JSON.stringify(args),
    "--cli-flags",
    JSON.stringify(flags),
  ];

  return new Promise((resolve) => {
    const chunks: Buffer[] = [];

    const proc = spawn("bun", runnerArgs, {
      cwd,
      stdio: ["inherit", "inherit", "pipe"],
      env: process.env,
    });

    proc.stderr.on("data", (chunk: Buffer) => {
      chunks.push(chunk);
    });

    proc.on("close", (code) => {
      if (code !== 0) {
        const stderrText = Buffer.concat(chunks).toString().trim();
        if (stderrText) {
          console.error(stderrText);
        }
      }

      resolve({
        success: code === 0,
        ...(code !== 0
          ? { message: `Command failed with exit code ${code}` }
          : {}),
      });
    });
  });
}
