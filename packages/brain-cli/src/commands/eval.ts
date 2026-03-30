import { existsSync } from "fs";
import { join } from "path";
import type { CommandResult } from "../run-command";

/**
 * Extract raw args after 'eval' from the CLI argv.
 * Everything after 'eval' is passed through to brain-eval.
 */
export function buildEvalArgs(argv: string[]): string[] {
  const evalIndex = argv.indexOf("eval");
  if (evalIndex === -1) return [];
  return argv.slice(evalIndex + 1);
}

/**
 * Run brain eval by spawning the brain-eval binary.
 * All args after 'eval' are passed through.
 */
export async function runEval(
  cwd: string,
  rawArgv: string[],
): Promise<CommandResult> {
  const hasEvalConfig =
    existsSync(join(cwd, "brain.eval.yaml")) ||
    existsSync(join(cwd, "eval.yaml")) ||
    existsSync(join(cwd, "brain.eval.config.ts"));

  if (!hasEvalConfig) {
    return {
      success: false,
      message:
        "No eval config found. Expected brain.eval.yaml, eval.yaml, or brain.eval.config.ts",
    };
  }

  const evalArgs = buildEvalArgs(rawArgv);

  const proc = Bun.spawn(["bun", "run", "eval", ...evalArgs], {
    cwd,
    stdio: ["inherit", "inherit", "inherit"],
    env: process.env,
  });

  const exitCode = await proc.exited;
  return {
    success: exitCode === 0,
    ...(exitCode !== 0 ? { message: `Eval exited with code ${exitCode}` } : {}),
  };
}
