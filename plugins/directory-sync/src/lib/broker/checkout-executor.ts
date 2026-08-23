import simpleGit from "simple-git";
import type { SimpleGit } from "simple-git";
import type { Logger } from "@brains/utils/logger";
import { SerialQueue } from "@brains/utils/serial-queue";
import { commitGitChanges, pushGitChanges } from "./git-commit";
import { getFileHistory, showFileAtCommit } from "./git-history";
import { initializeGitRepository } from "./git-init";
import { pullGitChanges } from "./git-pull";
import {
  getCurrentReconciliationCheckpoint,
  getReconciliationDelta,
} from "./git-reconciliation-state";
import type { ReconciliationIdentity } from "./git-reconciliation-state";
import { getGitStatus, hasGitLocalChanges } from "./git-status";
import {
  buildGitCredentialEnv,
  MANAGED_GIT_CONFIG_ARGS,
} from "./git-credentials";
import { parseGitOperationResult } from "./operations";
import type { GitOperation, GitOperationResult } from "./operations";

/**
 * Runs semantic Git operations for exactly one checkout.
 *
 * This is where ownership actually lives. Every operation takes one turn of a
 * serial queue and holds it for the complete sequence, so a second caller
 * cannot run between another caller's `add -A` and its `commit` — the
 * interleaving reproduced in `test/git/operation-atomicity.test.ts`, where one
 * owner's commit captured the other owner's file.
 *
 * `simple-git` is constructed here and nowhere else. It is a Git adapter, not
 * an ownership or recovery boundary: if Bun loses a child completion, its
 * Promise simply never settles, the queue turn stays held, and the operation
 * stays owned rather than being retried or unlocked. Detecting and recovering
 * from that is supervision's job, not this class's.
 */

export interface CheckoutExecutorOptions {
  logger: Logger;
  dataDir: string;
  branch: string;
  remoteUrl: string;
  /**
   * Turned into environment-supplied Git config for each network child, so it
   * never reaches `.git/config` or argv. See `git-credentials.ts`.
   */
  authToken?: string | undefined;
  remoteFingerprint: string;
  timeoutMs: number;
  authorName?: string | undefined;
  authorEmail?: string | undefined;
  /** Deterministic completion-boundary fault used by real-process recovery tests. */
  afterOperation?: ((operation: GitOperation) => Promise<void>) | undefined;
}

export interface OperationRunOptions {
  signal?: AbortSignal | undefined;
  onProgress?: (() => void) | undefined;
  /**
   * Called once the operation holds the checkout turn.
   *
   * Waiting in the queue is not stalling, so nothing may judge this
   * request's progress until it has actually started.
   */
  onStart?: (() => void) | undefined;
}

export class CheckoutOperationExecutor {
  readonly #queue = new SerialQueue();
  readonly #options: CheckoutExecutorOptions;
  #git: SimpleGit | null = null;

  constructor(options: CheckoutExecutorOptions) {
    this.#options = options;
  }

  get identity(): ReconciliationIdentity {
    return {
      branch: this.#options.branch,
      remoteFingerprint: this.#options.remoteFingerprint,
    };
  }

  /**
   * One turn per operation. The turn covers the whole sequence, which is the
   * property command-level exclusion cannot provide.
   */
  execute<TOperation extends GitOperation>(
    operation: TOperation,
    runOptions: OperationRunOptions = {},
  ): Promise<GitOperationResult<TOperation["name"]>> {
    // Checked on the way out as well as on the way in: the contract is what
    // makes the result typed, and a broker bug should surface here rather than
    // as a well-formed lie to whoever asked.
    return this.#queue.run(async () => {
      runOptions.onStart?.();
      const value = await this.#dispatch(operation, runOptions);
      // This seam is after the adapter returned: a fault here reproduces the
      // affected Bun shape where Git exited and changed the checkout but the
      // completion observed by the owner never settles.
      await this.#options.afterOperation?.(operation);
      return parseGitOperationResult<TOperation["name"]>(operation.name, value);
    }, runOptions.signal);
  }

  get #client(): SimpleGit {
    // Local operations are managed too: a `pre-commit` hook runs inside
    // the checkout turn just as surely as a network one does. The rules
    // travel as environment-supplied config, the same way the credential
    // does, so nothing lands in argv or in the repository.
    this.#git ??= simpleGit(this.#options.dataDir, {
      config: MANAGED_GIT_CONFIG_ARGS,
      unsafe: { allowUnsafeHooksPath: true },
    });
    return this.#git;
  }

  get #credentialEnv(): Record<string, string> {
    return buildGitCredentialEnv(
      this.#options.remoteUrl,
      this.#options.authToken,
    );
  }

  /**
   * Network settings for one operation, including its progress signal.
   *
   * Only `pull` used to carry it, so a clone or a push that ran longer
   * than the stale-progress policy was terminated for making no progress
   * while transferring perfectly well.
   */
  #netFor(runOptions: OperationRunOptions): {
    baseDir: string;
    timeoutMs: number;
    credentialEnv: Record<string, string>;
    onProgress?: (() => void) | undefined;
  } {
    return {
      baseDir: this.#options.dataDir,
      timeoutMs: this.#options.timeoutMs,
      credentialEnv: this.#credentialEnv,
      ...(runOptions.onProgress ? { onProgress: runOptions.onProgress } : {}),
    };
  }

  async #dispatch(
    operation: GitOperation,
    runOptions: OperationRunOptions,
  ): Promise<GitOperationResult> {
    const { logger, branch, remoteUrl } = this.#options;

    switch (operation.name) {
      case "initialize":
        this.#git = await initializeGitRepository({
          logger,
          dataDir: this.#options.dataDir,
          remoteUrl,
          credentialEnv: this.#credentialEnv,
          branch,
          timeoutMs: this.#options.timeoutMs,
          ...(runOptions.onProgress
            ? { onProgress: runOptions.onProgress }
            : {}),
          ...(runOptions.signal ? { signal: runOptions.signal } : {}),
          ...(this.#options.authorName
            ? { authorName: this.#options.authorName }
            : {}),
          ...(this.#options.authorEmail
            ? { authorEmail: this.#options.authorEmail }
            : {}),
        });
        return undefined;

      case "get-status":
        return getGitStatus(this.#client, logger, branch, remoteUrl);

      case "has-local-changes":
        return hasGitLocalChanges(this.#client);

      case "commit":
        return commitGitChanges(this.#client, logger, operation.message);

      case "push":
        return pushGitChanges(
          logger,
          branch,
          this.#netFor(runOptions),
          runOptions.signal,
        );

      case "commit-and-push": {
        // One turn covers status, commit, push, and the checkpoint derived
        // from the resulting HEAD, so nothing can move HEAD between the push
        // and the capture that advances past it.
        const status = await getGitStatus(
          this.#client,
          logger,
          branch,
          remoteUrl,
        );
        if (!status.isRepo) {
          throw new Error("Git repository is unavailable");
        }
        if (!status.hasChanges && status.ahead === 0) {
          // A prior attempt may have pushed successfully and crashed before
          // acknowledging its durable caller. Return the currently confirmed
          // local/remote checkpoint so that attempt can settle safely.
          return {
            pushed: false,
            checkpoint: await getCurrentReconciliationCheckpoint(
              this.#client,
              this.identity,
            ),
          };
        }
        if (status.hasChanges) {
          await commitGitChanges(this.#client, logger);
        }
        await pushGitChanges(
          logger,
          branch,
          this.#netFor(runOptions),
          runOptions.signal,
        );
        return {
          pushed: true,
          checkpoint: await getCurrentReconciliationCheckpoint(
            this.#client,
            this.identity,
          ),
        };
      }

      case "pull":
        return pullGitChanges(
          this.#client,
          logger,
          branch,
          this.#netFor(runOptions),
          runOptions.signal,
        );

      case "get-reconciliation-delta":
        return getReconciliationDelta(
          this.#client,
          this.identity,
          operation.checkpoint,
        );

      case "get-checkpoint":
        return getCurrentReconciliationCheckpoint(this.#client, this.identity);

      case "log-file":
        return getFileHistory(
          this.#client,
          operation.filePath,
          operation.limit,
        );

      case "show-file":
        return showFileAtCommit(
          this.#client,
          operation.sha,
          operation.filePath,
        );
    }
  }
}
