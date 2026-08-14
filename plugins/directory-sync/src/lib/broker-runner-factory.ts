import { BrokerGitCommandRunner, registerCheckout } from "./broker/client";
import { MAX_OUTPUT_BYTES } from "./broker/protocol";
import type { GitRunnerFactory } from "./git-runner-factory";
import type { GitCommandOptions, GitCommandRunner } from "./owned-git";

/**
 * Broker-backed execution boundary for a checkout.
 *
 * Registration is lazy and idempotent rather than a separate lifecycle step:
 * the first command declares the checkout, and re-declaring identical
 * identity is a no-op. That means no caller can forget to register, and a
 * broker restart is recovered on the next command rather than needing the
 * plugin to notice.
 */

export interface BrokerRunnerFactoryOptions {
  socketPath: string;
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
  let declaration: Promise<unknown> | null = null;

  const declare = (): Promise<unknown> => {
    declaration ??= registerCheckout(options.socketPath, {
      repositoryKey: options.repositoryKey,
      checkoutPath: options.checkoutPath,
      branch: options.branch,
      remoteFingerprint: options.remoteFingerprint,
      timeoutMs: options.timeoutMs,
      maxOutputBytes: options.maxOutputBytes ?? MAX_OUTPUT_BYTES,
    }).catch((error: unknown) => {
      // A failed declaration must not be cached, or one unlucky startup would
      // wedge every later command against a broker that has since recovered.
      declaration = null;
      throw error;
    });
    return declaration;
  };

  return (request): GitCommandRunner => {
    const runner = new BrokerGitCommandRunner({
      socketPath: options.socketPath,
      repositoryKey: options.repositoryKey,
      ...(request.bootstrap ? { operationClass: "bootstrap" as const } : {}),
    });

    return {
      run: async (
        args,
        commandOptions?: GitCommandOptions,
      ): Promise<string> => {
        await declare();
        return runner.run(args, {
          signal: combineSignals(request.signal, commandOptions?.signal),
          onProgress: combineProgress(
            request.onProgress,
            commandOptions?.onProgress,
          ),
        });
      },
    };
  };
}
