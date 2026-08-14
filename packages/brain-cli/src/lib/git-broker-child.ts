import { join } from "node:path";
import { GitBrokerServer } from "@brains/directory-sync/broker";
import { getErrorMessage } from "@brains/utils/error";
import type { CommandResult } from "./command-result";

/**
 * The `--child=git-broker` role.
 *
 * It deliberately does not boot a Brain: the broker owns Git execution and
 * nothing else, so it has no entities, no jobs, and no HTTP surface to start.
 * Keeping it that small is what makes it safe to bring up before the web child
 * and tear down after it.
 */

export const GIT_BROKER_RUNTIME_DIR_ENV = "BRAIN_GIT_BROKER_RUNTIME_DIR";

export interface GitBrokerChildDependencies {
  env?: Record<string, string | undefined>;
  /** Announces readiness to the supervisor over IPC. */
  notifyReady?: ((message: { type: string }) => void) | undefined;
  /** Resolves when the child should shut down; defaults to SIGINT/SIGTERM. */
  untilShutdown?: () => Promise<void>;
  startBroker?: typeof GitBrokerServer.start;
}

export function resolveGitBrokerRuntimeDir(
  cwd: string,
  env: Record<string, string | undefined>,
): string {
  const configured = env[GIT_BROKER_RUNTIME_DIR_ENV];
  if (configured) return configured;
  // Outside the checkout on purpose: the broker's socket and journal must
  // survive a checkout being replaced, and must never be committed.
  const dataHome = env["XDG_DATA_HOME"];
  return dataHome
    ? join(dataHome, "brain", "git-broker")
    : join(cwd, ".brain-runtime", "git-broker");
}

function defaultUntilShutdown(): Promise<void> {
  return new Promise<void>((resolve) => {
    const stop = (): void => {
      process.removeListener("SIGINT", stop);
      process.removeListener("SIGTERM", stop);
      resolve();
    };
    process.on("SIGINT", stop);
    process.on("SIGTERM", stop);
  });
}

export async function runGitBrokerChild(
  cwd: string,
  dependencies: GitBrokerChildDependencies = {},
): Promise<CommandResult> {
  const env = dependencies.env ?? process.env;
  const runtimeDir = resolveGitBrokerRuntimeDir(cwd, env);
  const start = dependencies.startBroker ?? GitBrokerServer.start;
  const notifyReady =
    dependencies.notifyReady ??
    ((message): void => {
      process.send?.(message);
    });

  const broker = await start({ runtimeDir }).catch((error: unknown) => {
    return { error: getErrorMessage(error) } as const;
  });

  if ("error" in broker) {
    return {
      success: false,
      message: `Git broker failed to start: ${broker.error}`,
      exitCode: 1,
    };
  }

  notifyReady({ type: "broker-ready" });
  await (dependencies.untilShutdown ?? defaultUntilShutdown)();
  await broker.stop();
  return { success: true };
}
