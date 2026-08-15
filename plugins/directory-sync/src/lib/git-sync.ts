import type { SimpleGit } from "simple-git";
import simpleGit from "simple-git";
import type { Logger } from "@brains/utils/logger";
import type {
  GitLogEntry,
  GitReconciliationCheckpoint,
  GitReconciliationDelta,
  GitSyncStatus,
  IGitSync,
  PullResult,
} from "../types";
import { commitGitChanges, pushGitChanges } from "./git-commit";
import { getFileHistory, showFileAtCommit } from "./git-history";
import { initializeGitRepository } from "./git-init";
import { SerialQueue } from "@brains/utils/serial-queue";
import {
  DEFAULT_GIT_TIMEOUT_MS,
  getAuthenticatedGitUrl,
  getGitRemoteFingerprint,
  resolveGitRemoteUrl,
} from "./git-options";
import type { GitSyncOptions } from "./git-options";
import { pullGitChanges } from "./git-pull";
import { getGitStatus, hasGitLocalChanges } from "./git-status";
import {
  getCurrentReconciliationCheckpoint,
  getReconciliationDelta,
} from "./git-reconciliation-state";
import type { ReconciliationIdentity } from "./git-reconciliation-state";

export type { GitSyncOptions } from "./git-options";
export type { GitSyncStatus, PullResult } from "../types";

/**
 * Pure git operations class — no messaging, no timers.
 *
 * The directory-sync plugin orchestrates when to call these methods.
 * This class only knows how to talk to git.
 */
export class GitSync implements IGitSync {
  private _git: SimpleGit | null = null;
  private readonly logger: Logger;
  private readonly remoteUrl: string;
  private readonly remoteFingerprint: string;
  private readonly branch: string;
  private readonly authorName: string | undefined;
  private readonly authorEmail: string | undefined;
  private readonly authToken: string | undefined;
  private readonly dataDir: string;
  private readonly timeoutMs: number;
  /**
   * One turn per operation — auto-commit and periodic sync cannot interleave
   * inside each other's commit or pull.
   */
  private readonly lock = new SerialQueue();
  private readonly lifecycleController = new AbortController();
  private readonly activeOperations = new Set<Promise<unknown>>();
  private acceptingOperations = true;
  private cleanupPromise: Promise<void> | null = null;

  constructor(options: GitSyncOptions) {
    this.logger = options.logger;
    this.dataDir = options.dataDir;
    this.remoteUrl = resolveGitRemoteUrl(options);
    this.remoteFingerprint = getGitRemoteFingerprint(this.remoteUrl);
    this.branch = options.branch ?? "main";
    this.authorName = options.authorName;
    this.authorEmail = options.authorEmail;
    this.authToken = options.authToken;
    this.timeoutMs = options.timeoutMs ?? DEFAULT_GIT_TIMEOUT_MS;
  }

  private get git(): SimpleGit {
    this._git ??= simpleGit(this.dataDir);
    return this._git;
  }

  private get identity(): ReconciliationIdentity {
    return { branch: this.branch, remoteFingerprint: this.remoteFingerprint };
  }

  private get net(): { baseDir: string; timeoutMs: number } {
    return { baseDir: this.dataDir, timeoutMs: this.timeoutMs };
  }

  /**
   * Initialize git repository — clone, init, or update remote.
   */
  initialize(): Promise<void> {
    return this.runOperation(async () => {
      this._git = await initializeGitRepository({
        logger: this.logger,
        dataDir: this.dataDir,
        remoteUrl: this.remoteUrl,
        authenticatedUrl: getAuthenticatedGitUrl(
          this.remoteUrl,
          this.authToken,
        ),
        branch: this.branch,
        timeoutMs: this.timeoutMs,
        signal: this.lifecycleController.signal,
        authorName: this.authorName,
        authorEmail: this.authorEmail,
      });
    });
  }

  hasRemote(): boolean {
    return !!this.remoteUrl;
  }

  getStatus(): Promise<GitSyncStatus> {
    return this.runOperation(() =>
      getGitStatus(this.git, this.logger, this.branch, this.remoteUrl),
    );
  }

  /**
   * Check if there are uncommitted local changes.
   */
  hasLocalChanges(): Promise<boolean> {
    return this.runOperation(() => hasGitLocalChanges(this.git));
  }

  commit(message?: string): Promise<void> {
    return this.runOperation(() =>
      commitGitChanges(this.git, this.logger, message),
    );
  }

  push(signal?: AbortSignal): Promise<void> {
    return this.runOperation(() =>
      pushGitChanges(
        this.logger,
        this.branch,
        this.net,
        this.getOperationSignal(signal),
      ),
    );
  }

  /**
   * Status, commit, push, and the checkpoint of the resulting HEAD in one
   * turn. Splitting it lets another owner's pull land between the push and
   * the capture, advancing the checkpoint past changes that were never
   * enqueued — see the note in `lib/broker/operations.ts`.
   */
  commitAndPush(): Promise<{
    pushed: boolean;
    checkpoint: GitReconciliationCheckpoint | null;
  }> {
    return this.runOperation(async () => {
      const status = await getGitStatus(
        this.git,
        this.logger,
        this.branch,
        this.remoteUrl,
      );
      if (!status.isRepo) {
        throw new Error("Git repository is unavailable");
      }
      if (!status.hasChanges && status.ahead === 0) {
        return { pushed: false, checkpoint: null };
      }
      if (status.hasChanges) {
        await commitGitChanges(this.git, this.logger);
      }
      await pushGitChanges(
        this.logger,
        this.branch,
        this.net,
        this.getOperationSignal(),
      );
      return {
        pushed: true,
        checkpoint: await getCurrentReconciliationCheckpoint(
          this.git,
          this.identity,
        ),
      };
    });
  }

  pull(signal?: AbortSignal, onProgress?: () => void): Promise<PullResult> {
    return this.runOperation(() =>
      pullGitChanges(
        this.git,
        this.logger,
        this.branch,
        { ...this.net, ...(onProgress ? { onProgress } : {}) },
        this.getOperationSignal(signal),
      ),
    );
  }

  getReconciliationDelta(
    checkpoint?: GitReconciliationCheckpoint,
  ): Promise<GitReconciliationDelta> {
    return this.runOperation(() =>
      getReconciliationDelta(this.git, this.identity, checkpoint),
    );
  }

  log(filePath: string, limit?: number): Promise<GitLogEntry[]> {
    return this.runOperation(() => getFileHistory(this.git, filePath, limit));
  }

  show(sha: string, filePath: string): Promise<string> {
    return this.runOperation(() => showFileAtCommit(this.git, sha, filePath));
  }

  cleanup(): Promise<void> {
    if (this.cleanupPromise) return this.cleanupPromise;

    this.acceptingOperations = false;
    this.lifecycleController.abort(new Error("Git sync is shutting down"));
    this.cleanupPromise = (async (): Promise<void> => {
      while (this.activeOperations.size > 0) {
        await Promise.allSettled([...this.activeOperations]);
      }
      this._git = null;
    })();
    return this.cleanupPromise;
  }

  private getOperationSignal(signal?: AbortSignal): AbortSignal {
    return signal
      ? AbortSignal.any([this.lifecycleController.signal, signal])
      : this.lifecycleController.signal;
  }

  /**
   * One turn per operation. This used to only track an operation for shutdown
   * accounting, which is why two callers could interleave inside a single
   * commit: the lock was opt-in and only composite callers took it.
   */
  private runOperation<T>(operation: () => Promise<T>): Promise<T> {
    if (!this.acceptingOperations) {
      return Promise.reject(new Error("Git sync is shutting down"));
    }

    let tracked: Promise<T>;
    try {
      tracked = this.lock
        .run(operation, this.getOperationSignal())
        .finally(() => {
          this.activeOperations.delete(tracked);
        });
    } catch (error) {
      return Promise.reject(error);
    }
    this.activeOperations.add(tracked);
    return tracked;
  }
}
