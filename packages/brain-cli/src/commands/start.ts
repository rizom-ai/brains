import { existsSync } from "fs";
import { join, dirname } from "path";
import type { CommandResult } from "../run-command";
import { parseBrainYaml } from "../lib/brain-yaml";
import {
  getAvailableModels,
  getModel,
  hasRegisteredModels,
} from "../lib/model-registry";
import { checkApiKey } from "../lib/preflight";
import { formatBootError } from "../lib/boot-errors";
import {
  spawnBunRunner,
  type SpawnBunRunnerDependencies,
} from "../lib/spawn-bun-runner";

type StartDependencies = SpawnBunRunnerDependencies;

/**
 * Detect monorepo root by walking up looking for bun.lock.
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
 * Find the monorepo runner script.
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

  // Legacy Docker path — fallback during transition
  const entrypoint = join(cwd, "dist", ".model-entrypoint.js");
  if (existsSync(entrypoint)) {
    return { path: entrypoint, type: "standalone" };
  }

  return undefined;
}

/**
 * Determine runner type for a directory.
 */
export function resolveRunnerType(
  cwd: string,
): "monorepo" | "docker" | "builtin" | undefined {
  const runner = findRunner(cwd);
  if (runner) return runner.type === "monorepo" ? "monorepo" : "docker";

  // Bundled mode — models registered in-process
  if (hasRegisteredModels()) return "builtin";

  return undefined;
}

export async function start(
  cwd: string,
  flags: { chat: boolean; startupCheck?: boolean },
  dependencies: StartDependencies = {},
): Promise<CommandResult> {
  if (!existsSync(join(cwd, "brain.yaml"))) {
    return {
      success: false,
      message: `No brain.yaml found in ${cwd}. Run 'brain init <dir>' first.`,
    };
  }

  const runner = findRunner(cwd);

  if (runner) {
    const args = ["run", runner.path];
    if (flags.chat) args.push("--cli");
    if (flags.startupCheck) args.push("--startup-check");

    return spawnBunRunner({
      cwd,
      args,
      failureMessage: (code) => `Brain exited with code ${code}`,
      ...dependencies,
    });
  }

  if (hasRegisteredModels()) {
    const keyCheck = checkApiKey(process.env);
    if (!flags.startupCheck && !keyCheck.ok) {
      return {
        success: false,
        message: keyCheck.message ?? "AI_API_KEY is not set.",
      };
    }

    const config = parseBrainYaml(cwd);

    const definition = getModel(config.brain);
    if (!definition) {
      return {
        success: false,
        message: `Unknown model: ${config.brain}. Available: ${getAvailableModels().join(", ")}`,
      };
    }

    // In-process boot — the build entrypoint registers a boot function
    // alongside the model definitions. This import is resolved at bundle time.
    try {
      const { bootBrain } = await import("../lib/boot");
      await bootBrain(cwd, config.brain, definition, flags);
      return { success: true };
    } catch (error) {
      return {
        success: false,
        message: formatBootError(error),
      };
    }
  }

  return {
    success: false,
    message:
      "Could not find brain runner. Install @rizom/brain globally or run from the monorepo.",
  };
}
