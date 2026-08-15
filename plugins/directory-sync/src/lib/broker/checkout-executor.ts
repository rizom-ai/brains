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
  /** Used only for network operations; never written to `.git/config`. */
  authenticatedUrl: string;
  remoteFingerprint: string;
  timeoutMs: number;
  authorName?: string | undefined;
  authorEmail?: string | undefined;
}

export interface OperationRunOptions {
  signal?: AbortSignal | undefined;
  onProgress?: (() => void) | undefined;
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
      const value = await this.#dispatch(operation, runOptions);
      return parseGitOperationResult<TOperation["name"]>(operation.name, value);
    }, runOptions.signal);
  }

  get #client(): SimpleGit {
    this.#git ??= simpleGit(this.#options.dataDir);
    return this.#git;
  }

  get #net(): { baseDir: string; timeoutMs: number } {
    return {
      baseDir: this.#options.dataDir,
      timeoutMs: this.#options.timeoutMs,
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
          authenticatedUrl: this.#options.authenticatedUrl,
          branch,
          timeoutMs: this.#options.timeoutMs,
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
        return pushGitChanges(logger, branch, this.#net, runOptions.signal);

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
          return { pushed: false, checkpoint: null };
        }
        if (status.hasChanges) {
          await commitGitChanges(this.#client, logger);
        }
        await pushGitChanges(logger, branch, this.#net, runOptions.signal);
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
          {
            ...this.#net,
            ...(runOptions.onProgress
              ? { onProgress: runOptions.onProgress }
              : {}),
          },
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
