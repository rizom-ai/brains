import { BrokerGitCommandRunner, registerCheckout } from "./broker/client";
import { hostGitBroker } from "./broker/hosted";
import { MAX_OUTPUT_BYTES } from "./broker/protocol";
import type { GitRunnerFactory } from "./git-runner-factory";
import type { GitCommandOptions, GitCommandRunner } from "./owned-git";

/**
 * The execution boundary for a checkout: always a broker, never in-process.
 *
 * Where the broker lives is a lifecycle detail. A supervised brain is handed a
 * socket by its supervisor; anything else hosts one for itself. Both reach the
 * same executor and the same OS-owned wrapper, so there is no configuration in
 * which Git runs on an application event loop.
 *
 * Registration is lazy and idempotent rather than a separate lifecycle step:
 * the first command declares the checkout, and re-declaring identical identity
 * is a no-op. No caller can forget it, and a broker restart is recovered on
 * the next command rather than needing the plugin to notice.
 */

export interface BrokerRunnerFactoryOptions {
  /** Socket handed down by a supervisor; absent means host one here. */
  socketPath?: string | undefined;
  repositoryKey: string;
  checkoutPath: string;
  branch: string;
  remoteFingerprint: string;
  timeoutMs: number;
  maxOutputBytes?: number | undefined;
}

function combineSignals(
  first?: AbortSignal,
  second?: AbortSignal,
): AbortSignal | undefined {
  if (!first) return second;
  if (!second || first === second) return first;
  return AbortSignal.any([first, second]);
}

function combineProgress(
  first?: () => void,
  second?: () => void,
): (() => void) | undefined {
  if (!first) return second;
  if (!second || first === second) return first;
  return (): void => {
    first();
    second();
  };
}

export function createBrokerGitRunnerFactory(
  options: BrokerRunnerFactoryOptions,
): GitRunnerFactory {
  let connection: Promise<string> | null = null;

  const socket = (): Promise<string> => {
    connection ??= (async (): Promise<string> => {
      const socketPath =
        options.socketPath ?? (await hostGitBroker()).socketPath;

      await registerCheckout(socketPath, {
        repositoryKey: options.repositoryKey,
        checkoutPath: options.checkoutPath,
        branch: options.branch,
        remoteFingerprint: options.remoteFingerprint,
        timeoutMs: options.timeoutMs,
        maxOutputBytes: options.maxOutputBytes ?? MAX_OUTPUT_BYTES,
      });
      return socketPath;
    })().catch((error: unknown) => {
      connection = null;
      throw error;
    });
    return connection;
  };

  return (request): GitCommandRunner => ({
    run: async (args, commandOptions?: GitCommandOptions): Promise<string> => {
      const socketPath = await socket();
      const runner = new BrokerGitCommandRunner({
        socketPath,
        repositoryKey: options.repositoryKey,
        ...(request.bootstrap ? { operationClass: "bootstrap" as const } : {}),
      });

      return runner.run(args, {
        signal: combineSignals(request.signal, commandOptions?.signal),
        onProgress: combineProgress(
          request.onProgress,
          commandOptions?.onProgress,
        ),
      });
    },
  });
}
