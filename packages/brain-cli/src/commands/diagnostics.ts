import { existsSync } from "fs";
import { join } from "path";
import type { CommandResult } from "../run-command";
import { findRunner } from "./start";
import { spawnBunRunner } from "../lib/spawn-bun-runner";

/**
 * brain diagnostics <subcommand>
 *
 * Routes to the runner with --diagnostics flag.
 * Actual logic lives in shell/app/src/cli.ts.
 */
export async function diagnostics(
  dir: string,
  subcommand: string,
): Promise<CommandResult> {
  if (!existsSync(join(dir, "brain.yaml"))) {
    return {
      success: false,
      message: `No brain.yaml found in ${dir}. Run 'brain init <dir>' first.`,
    };
  }

  if (!subcommand) {
    return {
      success: false,
      message: [
        "Usage: brain diagnostics <subcommand>",
        "",
        "Subcommands:",
        "  search    Analyze search distance distribution for threshold tuning",
      ].join("\n"),
    };
  }

  const runner = findRunner(dir);
  if (!runner) {
    return {
      success: false,
      message:
        "Could not find brain runner. Install @rizom/brain globally or run from the monorepo.",
    };
  }

  return spawnBunRunner({
    cwd: dir,
    args: ["run", runner.path, "diagnostics", subcommand],
    failureMessage: (code) => `Diagnostics failed (exit ${code})`,
  });
}
