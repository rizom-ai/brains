import { existsSync } from "fs";
import { join } from "path";
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

  const spawnArgs = [
    "bun",
    "run",
    runner.path,
    "--cli-command",
    commandName,
    "--cli-args",
    JSON.stringify(args),
    "--cli-flags",
    JSON.stringify(flags),
  ];

  const proc = Bun.spawn(spawnArgs, {
    cwd,
    stdout: "inherit",
    stderr: "pipe",
    env: process.env,
  });

  const stderrText = await new Response(proc.stderr).text();
  const exitCode = await proc.exited;

  if (exitCode !== 0 && stderrText.trim()) {
    console.error(stderrText.trim());
  }

  return {
    success: exitCode === 0,
    ...(exitCode !== 0
      ? { message: `Command failed with exit code ${exitCode}` }
      : {}),
  };
}
