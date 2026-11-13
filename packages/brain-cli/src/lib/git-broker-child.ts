import {
  GIT_BROKER_SOCKET_ENV,
  gitBrokerRuntimeDir,
  startGitBrokerHost,
  type GitBrokerHostOptions,
} from "@brains/directory-sync/broker-runtime";
import { ConsoleLogger } from "@brains/utils/logger";
import { getErrorMessage } from "@brains/utils/error";
import { interpolateEnv } from "@brains/utils/string-utils";
import type { CommandResult } from "./command-result";
import { BRAIN_DEFAULT_DATA_DIR } from "./git-broker-spec";

/**
 * The `--child=git-broker` role.
 *
 * It boots no Brain: no shell, no plugins, no traffic. It owns the checkout so
 * web and worker never run Git themselves, and it outlives them on shutdown so
 * a role finishing a request never finds the socket gone.
 */

interface BrokerChildProcess {
  env: NodeJS.ProcessEnv;
  send?: ((message: unknown) => void) | undefined;
  on(event: "SIGINT" | "SIGTERM", listener: () => void): unknown;
}

/** Structural on purpose: the child only ever stops what it started. */
interface RunningBroker {
  stop(): Promise<void>;
}

export interface GitBrokerChildConfig {
  plugins?: { "directory-sync"?: unknown } | undefined;
}

export interface GitBrokerChildDependencies {
  processImpl?: BrokerChildProcess;
  startHost?: (options: GitBrokerHostOptions) => Promise<RunningBroker>;
}

export async function runGitBrokerChild(
  cwd: string,
  config: GitBrokerChildConfig,
  dependencies: GitBrokerChildDependencies = {},
): Promise<CommandResult> {
  const processImpl = dependencies.processImpl ?? process;
  const startHost = dependencies.startHost ?? startGitBrokerHost;
  const socketPath = processImpl.env[GIT_BROKER_SOCKET_ENV];
  if (!socketPath) {
    return {
      success: false,
      message: `${GIT_BROKER_SOCKET_ENV} is unset; the Git broker is started by the Brain supervisor, not directly`,
      exitCode: 1,
    };
  }

  // Failing to start is terminal for the runtime — the supervisor boots no
  // Git-capable role without a ready owner, and there is no fallback owner to
  // use instead — so it exits without ever reporting ready.
  const started = await startHost({
    socketPath,
    // Named explicitly: a deep instance path puts the socket outside this
    // directory, so it cannot be recovered from the socket's location.
    runtimeDir: gitBrokerRuntimeDir(cwd),
    cwd,
    dataDir: BRAIN_DEFAULT_DATA_DIR,
    pluginConfig: interpolateEnv(
      config.plugins?.["directory-sync"] ?? {},
      processImpl.env,
    ),
    logger: ConsoleLogger.getInstance(),
  }).then(
    (broker) => ({ broker, error: undefined }),
    (error: unknown) => ({ broker: undefined, error }),
  );
  if (!started.broker) {
    return {
      success: false,
      message: `Git broker failed to start: ${getErrorMessage(started.error)}`,
      exitCode: 1,
    };
  }

  // Ready is the only thing the owner reports. Its supervisor watches for
  // it to exit, not for it to speak.
  processImpl.send?.({ type: "broker-ready" });

  await new Promise<void>((resolve) => {
    processImpl.on("SIGTERM", resolve);
    processImpl.on("SIGINT", resolve);
  });

  await started.broker.stop();
  return { success: true };
}
