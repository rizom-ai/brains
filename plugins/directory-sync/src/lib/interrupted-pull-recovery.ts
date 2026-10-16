import { getErrorMessage } from "@brains/utils/error";
import type {
  ActiveDirectorySyncRun,
  DirectorySyncOperationStatusService,
} from "./directory-sync-operation-status";
import type { InitialSyncRecovery } from "./initial-sync";

export type InterruptedPullRecoveryStatus = Pick<
  DirectorySyncOperationStatusService,
  "markProgress" | "createProgressObserver" | "finishInterruptedPull"
>;

/** The startup step that reconciled the checkout the pull left behind. */
export type InterruptedPullRecoveryPhase = "startup" | "initial sync";

/**
 * Settles a Git pull that a previous process left in flight, recording the
 * outcome on that run exactly where startup reconciles the checkout.
 *
 * Only the serving role records it: an execution-only process gets the same
 * no-op handle as a startup with nothing to recover, so the run stays open
 * for the role that will actually reconcile.
 */
export interface InterruptedPullRecovery {
  /** Run a recovery step; if it throws, record the recovery as failed. */
  guard<T>(step: () => Promise<T>): Promise<T>;
  /** Persist progress so the interrupted pull is not reported as stale. */
  progress(): Promise<void>;
  succeeded(phase: InterruptedPullRecoveryPhase): Promise<void>;
  /** No repository is configured, so nothing can reconcile the pull. */
  requiresRepository(): Promise<void>;
  /** Initial sync's pull settles the recovery; undefined when there is none. */
  initialSyncRecovery(): InitialSyncRecovery | undefined;
}

const nothingToRecover: InterruptedPullRecovery = {
  guard: <T>(step: () => Promise<T>): Promise<T> => step(),
  progress: async (): Promise<void> => {},
  succeeded: async (): Promise<void> => {},
  requiresRepository: async (): Promise<void> => {},
  initialSyncRecovery: (): undefined => undefined,
};

export function createInterruptedPullRecovery(options: {
  operationStatus: InterruptedPullRecoveryStatus;
  interruptedPull: Pick<ActiveDirectorySyncRun, "id"> | undefined;
  executionOnly: boolean;
}): InterruptedPullRecovery {
  const { operationStatus, interruptedPull } = options;
  if (options.executionOnly || !interruptedPull) return nothingToRecover;
  const runId = interruptedPull.id;

  const finish = (recovered: boolean, message: string): Promise<void> =>
    operationStatus.finishInterruptedPull(runId, { recovered, message });
  const succeeded = (phase: InterruptedPullRecoveryPhase): Promise<void> =>
    finish(true, `Recovered interrupted Git handoff during ${phase}`);
  const failed = (error: unknown): Promise<void> =>
    finish(
      false,
      `Interrupted Git handoff recovery failed: ${getErrorMessage(error)}`,
    );

  return {
    guard: async <T>(step: () => Promise<T>): Promise<T> => {
      try {
        return await step();
      } catch (error) {
        await failed(error);
        throw error;
      }
    },
    progress: (): Promise<void> => operationStatus.markProgress(runId),
    succeeded,
    requiresRepository: (): Promise<void> =>
      finish(
        false,
        "Interrupted Git handoff recovery requires a configured repository",
      ),
    initialSyncRecovery: (): InitialSyncRecovery => ({
      onGitProgress: operationStatus.createProgressObserver(runId),
      onGitRecoverySucceeded: (): Promise<void> => succeeded("initial sync"),
      onGitRecoveryFailed: failed,
    }),
  };
}
