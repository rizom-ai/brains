import { existsSync } from "fs";
import { join } from "path";
import { spawn } from "child_process";
import type { CommandResult } from "../lib/command-result";
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
 * In-process operate: boot brain, find tool by CLI name, invoke, print, exit.
 */
async function operateBuiltin(
  cwd: string,
  commandName: string,
  args: string[],
  flags: Record<string, unknown>,
): Promise<CommandResult> {
  const config = parseBrainYaml(cwd);

  try {
    const definition = await loadDefinition(config.brain);
    const { bootBrain } = await import("../lib/boot");

    // Boot in register-only mode — no daemons, no events
    const bootedBrain = await bootBrain(cwd, definition, {
      chat: false,
      mode: "register-only",
    });

    // After boot, the shell is initialized with tools registered. A boot in
    // register-only mode always returns the App, so a missing brain means the
    // entrypoint's boot function did not honour the mode it was given.
    if (!bootedBrain) {
      return {
        success: false,
        message: "Boot did not return a brain; cannot run CLI commands.",
      };
    }
    const mcpService = bootedBrain.getShell().getMCPService();
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

    if ("needsConfirmation" in result) {
      const detail = result.preview ? `\n\n${result.preview}` : "";
      console.log(`Confirmation needed: ${result.summary}${detail}`);
      return { success: true };
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
  } catch (error) {
    return {
      success: false,
      message: getErrorMessage(error, "Operation failed"),
    };
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

  const runnerArgs = [
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
