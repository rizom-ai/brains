import { existsSync, readFileSync } from "fs";
import { join, dirname } from "path";
import { spawn, spawnSync } from "child_process";
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
 * Find the runner script path (monorepo or Docker only).
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
 * Determine which runner type applies for the given directory.
 *
 * Priority: monorepo > docker > npm > undefined
 */
export function resolveRunnerType(
  cwd: string,
): "monorepo" | "docker" | "npm" | undefined {
  const runner = findRunner(cwd);
  if (runner) return runner.type === "monorepo" ? "monorepo" : "docker";

  // npm: package.json with a start script
  const pkgPath = join(cwd, "package.json");
  if (existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"));
      if (pkg?.scripts?.start) return "npm";
    } catch {
      // Invalid package.json — skip
    }
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
 * Auto-install dependencies if node_modules is missing.
 */
function ensureDependencies(cwd: string): CommandResult | undefined {
  if (existsSync(join(cwd, "node_modules"))) return undefined;

  console.log("Installing dependencies...");
  const result = spawnSync("bun", ["install"], {
    cwd,
    stdio: "inherit",
    env: process.env,
  });

  if (result.status !== 0) {
    return {
      success: false,
      message: "Failed to install dependencies. Is Bun installed?",
    };
  }

  return undefined;
}

/**
 * Start a brain. Detects runner type and delegates accordingly.
 *
 * - Monorepo: bun run shell/app/src/runner.ts
 * - Docker: bun run dist/.model-entrypoint.js
 * - npm: bun run start (uses package.json start script)
 */
export async function start(
  cwd: string,
  flags: { chat: boolean },
): Promise<CommandResult> {
  if (!existsSync(join(cwd, "brain.yaml"))) {
    return {
      success: false,
      message: `No brain.yaml found in ${cwd}. Run 'brain init <dir>' first.`,
    };
  }

  const runnerType = resolveRunnerType(cwd);

  if (!runnerType) {
    return {
      success: false,
      message:
        "Could not find brain runner. Are you in a monorepo, Docker container, or npm instance?",
    };
  }

  // npm path: auto-install + bun run start
  if (runnerType === "npm") {
    const installError = ensureDependencies(cwd);
    if (installError) return installError;

    const args = ["run", "start"];
    if (flags.chat) args.push("--", "--cli");

    return new Promise((resolve) => {
      const proc = spawn("bun", args, {
        cwd,
        stdio: "inherit",
        env: process.env,
      });

      proc.on("close", (code) => {
        resolve({
          success: code === 0,
          ...(code !== 0 ? { message: `Brain exited with code ${code}` } : {}),
        });
      });
    });
  }

  // Monorepo/Docker path: bun run <runner-path>
  const runner = findRunner(cwd);
  if (!runner) {
    return { success: false, message: "Runner not found." };
  }

  const args = ["run", runner.path];
  if (flags.chat) args.push("--cli");

  return new Promise((resolve) => {
    const proc = spawn("bun", args, {
      cwd,
      stdio: "inherit",
      env: process.env,
    });

    proc.on("close", (code) => {
      resolve({
        success: code === 0,
        ...(code !== 0 ? { message: `Brain exited with code ${code}` } : {}),
      });
    });
  });
}
