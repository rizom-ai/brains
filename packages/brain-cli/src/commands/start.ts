import { existsSync } from "fs";
import { join, dirname } from "path";
import type { CommandResult } from "../run-command";

/**
 * Detect whether we're in a monorepo (has bun.lock above us)
 * or a standalone instance (no bun.lock).
 */
export function findMonorepoRoot(from: string): string | undefined {
  let dir = from;
  let parent = dirname(dir);
  while (dir !== parent) {
    if (existsSync(join(dir, "bun.lock"))) {
      return dir;
    }
    dir = parent;
    parent = dirname(dir);
  }
  return undefined;
}

/**
 * Find the runner script path.
 *
 * In monorepo: shell/app/src/runner.ts (run from source)
 * In standalone: the .model-entrypoint.js in dist/ (run from bundle)
 */
export function findRunner(
  cwd: string,
): { path: string; type: "monorepo" | "standalone" } | undefined {
  const monorepoRoot = findMonorepoRoot(cwd);

  if (monorepoRoot) {
    const runner = join(monorepoRoot, "shell", "app", "src", "runner.ts");
    if (existsSync(runner)) {
      return { path: runner, type: "monorepo" };
    }
  }

  // Standalone: look for dist/.model-entrypoint.js
  const entrypoint = join(cwd, "dist", ".model-entrypoint.js");
  if (existsSync(entrypoint)) {
    return { path: entrypoint, type: "standalone" };
  }

  return undefined;
}

/**
 * Validate that brain.yaml exists and a runner is available.
 */
export function requireRunner(
  cwd: string,
): { path: string; type: "monorepo" | "standalone" } | CommandResult {
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

  return runner;
}

/**
 * Start a brain. Delegates to the existing runner which reads brain.yaml,
 * imports the brain model, resolves config, and boots.
 */
export async function start(
  cwd: string,
  flags: { chat: boolean },
): Promise<CommandResult> {
  const runner = requireRunner(cwd);
  if ("success" in runner) return runner;

  const args = ["run", runner.path];
  if (flags.chat) {
    args.push("--cli");
  }

  const proc = Bun.spawn(["bun", ...args], {
    cwd,
    stdio: ["inherit", "inherit", "inherit"],
    env: process.env,
  });

  const exitCode = await proc.exited;
  return {
    success: exitCode === 0,
    ...(exitCode !== 0
      ? { message: `Brain exited with code ${exitCode}` }
      : {}),
  };
}
