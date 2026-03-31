import { existsSync } from "fs";
import { join } from "path";
import { spawn } from "child_process";
import type { CommandResult } from "../run-command";
import { findRunner } from "./start";

/**
 * Run a CLI command via the brain's tool registry.
 *
 * Spawns the runner with --cli-command, --cli-args, and --cli-flags.
 * The runner boots headless, finds the tool by cli.name, translates
 * args/flags via schema-driven mapping, invokes the handler, prints result, exits.
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

  const runner = findRunner(cwd);
  if (!runner) {
    return {
      success: false,
      message:
        "Could not find brain runner. Are you in a monorepo or a deployed instance?",
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

    proc.stderr?.on("data", (chunk: Buffer) => {
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
