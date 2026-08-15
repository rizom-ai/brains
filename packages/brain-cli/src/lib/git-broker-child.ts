import { startGitBrokerHost } from "@brains/directory-sync";
import type { GitBrokerHostOptions } from "@brains/directory-sync";
import { Logger } from "@brains/utils/logger";
import { getErrorMessage } from "@brains/utils/error";
import type { CommandResult } from "./command-result";
import type { BrainYamlConfig } from "./brain-yaml";
import { BRAIN_DEFAULT_DATA_DIR } from "./git-broker-spec";
import { GIT_BROKER_SOCKET_ENV } from "./process-supervisor";

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

export interface GitBrokerChildDependencies {
  processImpl?: BrokerChildProcess;
  startHost?: (options: GitBrokerHostOptions) => Promise<RunningBroker>;
}

export async function runGitBrokerChild(
  cwd: string,
  config: BrainYamlConfig,
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
    cwd,
    dataDir: BRAIN_DEFAULT_DATA_DIR,
    pluginConfig: config.plugins?.["directory-sync"] ?? {},
    logger: Logger.getInstance(),
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

  processImpl.send?.({ type: "broker-ready" });
  await new Promise<void>((resolve) => {
    processImpl.on("SIGTERM", resolve);
    processImpl.on("SIGINT", resolve);
  });

  await started.broker.stop();
  return { success: true };
}
