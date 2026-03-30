import { existsSync } from "fs";
import { join } from "path";
import type { CommandResult } from "../run-command";
import { findRunner } from "./start";

/**
 * Run a brain operation: boot brain headless, invoke tool, print result, exit.
 *
 * Spawns the runner with --tool and --tool-input flags. The runner boots
 * the brain without daemons, invokes the tool, prints the result, and exits.
 */
export async function operate(
  cwd: string,
  toolName: string,
  toolInput: Record<string, unknown>,
): Promise<CommandResult> {
  if (!existsSync(join(cwd, "brain.yaml"))) {
    return {
      success: false,
      message: `No brain.yaml found in ${cwd}. Run 'brain init <dir>' first.`,
    };
  }

  const runner = findRunner(cwd);
  if (!runner) {
    return {
      success: false,
      message:
        "Could not find brain runner. Are you in a monorepo or a deployed instance?",
    };
  }

  const proc = Bun.spawn(
    [
      "bun",
      "run",
      runner.path,
      "--tool",
      toolName,
      "--tool-input",
      JSON.stringify(toolInput),
    ],
    {
      cwd,
      stdio: ["inherit", "inherit", "inherit"],
      env: process.env,
    },
  );

  const exitCode = await proc.exited;
  return {
    success: exitCode === 0,
    ...(exitCode !== 0
      ? { message: `Operation failed with exit code ${exitCode}` }
      : {}),
  };
}

/**
 * Map CLI commands to tool invocations.
 */
export function buildToolCall(
  command: string,
  args: string[],
  flags: Record<string, unknown>,
): { toolName: string; toolInput: Record<string, unknown> } | CommandResult {
  switch (command) {
    case "list":
      if (!args[0]) {
        return { success: false, message: "Usage: brain list <entityType>" };
      }
      return {
        toolName: "system_list",
        toolInput: { entityType: args[0] },
      };

    case "get":
      if (!args[0] || !args[1]) {
        return {
          success: false,
          message: "Usage: brain get <entityType> <id>",
        };
      }
      return {
        toolName: "system_get",
        toolInput: { entityType: args[0], id: args[1] },
      };

    case "search":
      if (!args[0]) {
        return { success: false, message: "Usage: brain search <query>" };
      }
      return {
        toolName: "system_search",
        toolInput: { query: args[0] },
      };

    case "sync":
      return {
        toolName: "directory-sync_sync",
        toolInput: {},
      };

    case "build":
      return {
        toolName: "site-builder_build-site",
        toolInput: {
          environment: flags["preview"] ? "preview" : "production",
        },
      };

    case "status":
      return {
        toolName: "system_status",
        toolInput: {},
      };

    default:
      return { success: false, message: `Unknown operation: ${command}` };
  }
}
