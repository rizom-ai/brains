import { existsSync } from "fs";
import { join, dirname } from "path";
import { parseLocalDatabaseEndpointConfig, type BootMode } from "@brains/core";
import type { CommandResult } from "../lib/command-result";
import { parseBrainYaml } from "../lib/brain-yaml";
import {
  hasCanonicalDefinition,
  loadDefinition,
} from "../lib/definition-registry";
import { checkApiKey } from "../lib/preflight";
import { formatBootError } from "../lib/boot-errors";
import { getErrorMessage } from "@brains/utils/error";
import { spawnBunRunner } from "../lib/spawn-bun-runner";
import {
  parseBrainChildRole,
  superviseRuntimeChildren,
  type ProcessSupervisorDependencies,
  type SupervisedChildRole,
} from "../lib/process-supervisor";
import {
  resolveGitBrokerEntrypointPath,
  resolveGitBrokerSpec,
} from "../lib/git-broker-spec";
import { withGitBrokerSidecar } from "../lib/git-broker-sidecar";
import {
  runGitBrokerChild,
  type GitBrokerChildDependencies,
} from "../lib/git-broker-child";

type StartDependencies = ProcessSupervisorDependencies &
  GitBrokerChildDependencies;

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
export function findRunner(cwd: string): { path: string } | undefined {
  const monorepoRoot = findMonorepoRoot(cwd);

  if (monorepoRoot) {
    const runner = join(monorepoRoot, "shell", "app", "src", "runner.ts");
    if (existsSync(runner)) {
      return { path: runner };
    }
  }

  return undefined;
}

/**
 * Determine runner type for a directory.
 */
export function resolveRunnerType(
  cwd: string,
): "monorepo" | "builtin" | undefined {
  const runner = findRunner(cwd);
  if (runner) return "monorepo";

  // Bundled mode — canonical definition registered in-process
  if (hasCanonicalDefinition()) return "builtin";

  return undefined;
}

export async function start(
  cwd: string,
  flags: { chat: boolean; mode?: BootMode },
  dependencies: StartDependencies = {},
): Promise<CommandResult> {
  if (!existsSync(join(cwd, "brain.yaml"))) {
    return {
      success: false,
      message: `No brain.yaml found in ${cwd}. Run 'brain init <dir>' first.`,
    };
  }

  let childRole: SupervisedChildRole | undefined;
  try {
    childRole = parseBrainChildRole(dependencies.argv ?? process.argv.slice(2));
  } catch (error) {
    return {
      success: false,
      message: getErrorMessage(error),
    };
  }
  const config = parseBrainYaml(cwd);

  // The broker child must be recognized before monorepo runner selection;
  // otherwise a development sidecar recursively starts another sidecar.
  if (childRole === "git-broker") {
    return runGitBrokerChild(cwd, config, dependencies);
  }

  const runner = findRunner(cwd);

  if (runner) {
    const args = ["run", runner.path];
    if (flags.chat) args.push("--cli");
    if (flags.mode === "startup-check") args.push("--startup-check");

    // Development boots a real Brain against a real checkout, so it needs
    // a real owner. Without one a Git-configured Brain simply fails to
    // register the plugin.
    return withGitBrokerSidecar(
      cwd,
      config,
      () =>
        spawnBunRunner({
          cwd,
          args,
          failureMessage: (code) => `Brain exited with code ${code}`,
          ...dependencies,
        }),
      dependencies,
    );
  }

  if (hasCanonicalDefinition()) {
    const keyCheck = checkApiKey(process.env);
    if (flags.mode !== "startup-check" && !keyCheck.ok) {
      return {
        success: false,
        message: keyCheck.message ?? "AI_API_KEY is not set.",
      };
    }

    // In-process boot — the package bundles the canonical definition. Explicitly
    // scoped external definitions remain dynamically authorable.
    try {
      const definition = await loadDefinition(config.brain);
      const { bootBrain } = await import("../lib/boot");

      if (flags.mode === undefined && !flags.chat && childRole === undefined) {
        const entrypointPath = dependencies.entrypointPath ?? process.argv[1];
        if (!entrypointPath) {
          return {
            success: false,
            message:
              "Cannot supervise Brain without a bundled entrypoint path.",
          };
        }
        await bootBrain(cwd, definition, {
          chat: false,
          operation: "migrate",
        });
        const gitBroker = resolveGitBrokerSpec(cwd, config);
        const gitBrokerEntrypoint =
          resolveGitBrokerEntrypointPath(entrypointPath);
        return await superviseRuntimeChildren(cwd, entrypointPath, {
          ...dependencies,
          ...(gitBroker
            ? {
                gitBroker: {
                  ...gitBroker,
                  ...(gitBrokerEntrypoint
                    ? { entrypointPath: gitBrokerEntrypoint }
                    : {}),
                },
              }
            : {}),
        });
      }

      const bootInPlace = async (): Promise<void> => {
        const bootedBrain = await bootBrain(cwd, definition, {
          ...flags,
          ...(childRole && {
            childRole,
            migrationsCompleted: true,
            localDatabaseEndpoint: parseLocalDatabaseEndpointConfig(
              dependencies.processImpl?.env ?? process.env,
            ),
          }),
        });
        if (flags.mode === "startup-check") {
          await bootedBrain?.stop?.();
        }
      };

      if (childRole) {
        // Supervised app roles already received the owner's socket from their
        // parent. Starting a sidecar here would create a second broker inside
        // each web/worker child and collide with the owner that started them.
        await bootInPlace();
      } else {
        // Chat and startup-check boot in place rather than under the full
        // supervisor, so they own one separate broker child for their run.
        await withGitBrokerSidecar(cwd, config, bootInPlace, dependencies);
      }
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
