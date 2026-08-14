import { OwnedGit } from "./owned-git";
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
import {
  getChangedPaths,
  pullGitChanges,
  tryResolveRemoteHead,
} from "./git-pull";
import { getGitStatus, hasGitLocalChanges } from "./git-status";
import { defaultGitRunnerFactory } from "./git-runner-factory";
import type { GitRunnerFactory } from "./git-runner-factory";

export type { GitSyncOptions } from "./git-options";
export type { GitSyncStatus, PullResult } from "../types";

/**
 * Pure git operations class — no messaging, no timers.
 *
 * The directory-sync plugin orchestrates when to call these methods.
 * This class only knows how to talk to git.
 */
export class GitSync implements IGitSync {
  private _git: OwnedGit | null = null;
  private readonly logger: Logger;
  private readonly remoteUrl: string;
  private readonly remoteFingerprint: string;
  private readonly branch: string;
  private readonly authorName: string | undefined;
  private readonly authorEmail: string | undefined;
  private readonly authToken: string | undefined;
  private readonly dataDir: string;
  private readonly timeoutMs: number;
  private readonly runnerFactory: GitRunnerFactory;
  private readonly lock = new SerialQueue();
  private readonly lifecycleController = new AbortController();
  private readonly activeOperations = new Set<Promise<unknown>>();
  private acceptingOperations = true;
  private cleanupPromise: Promise<void> | null = null;

  /**
   * Serialize git operations — prevents auto-commit and periodic-sync
   * from racing each other on commit/push/pull.
   */
  withLock<T>(fn: () => Promise<T>, signal?: AbortSignal): Promise<T> {
    if (!this.acceptingOperations) {
      return Promise.reject(new Error("Git sync is shutting down"));
    }
    return this.lock.run(fn, this.getOperationSignal(signal));
  }

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
    this.runnerFactory = options.runnerFactory ?? defaultGitRunnerFactory;
  }

  private get git(): OwnedGit {
    this._git ??= new OwnedGit(
      this.runnerFactory({
        ...this.net,
        signal: this.lifecycleController.signal,
      }),
    );
    return this._git;
  }

  private get net(): { baseDir: string; timeoutMs: number } {
    return { baseDir: this.dataDir, timeoutMs: this.timeoutMs };
  }

  /**
   * Initialize git repository — clone, init, or update remote.
   */
  initialize(): Promise<void> {
    return this.runOperation(async () => {
      // The client returned here is a *bootstrap* client: it may run clone,
      // init, and branch repair against a checkout that does not exist yet.
      // Its life ends with bootstrap. Keeping it would send every later
      // command under the bootstrap operation class, which the broker refuses
      // once the checkout is real — so discard it and let the lazy getter
      // build an ordinary client.
      await initializeGitRepository({
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
        runnerFactory: this.runnerFactory,
        authorName: this.authorName,
        authorEmail: this.authorEmail,
      });
      this._git = null;
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
        this.git,
        this.logger,
        this.branch,
        this.net,
        this.getOperationSignal(signal),
      ),
    );
  }

  pull(signal?: AbortSignal, onProgress?: () => void): Promise<PullResult> {
    return this.runOperation(() => {
      const operationSignal = this.getOperationSignal(signal);
      const git = this.git.withOptions({
        signal: operationSignal,
        ...(onProgress ? { onProgress } : {}),
      });
      return pullGitChanges(
        git,
        this.logger,
        this.branch,
        { ...this.net, ...(onProgress ? { onProgress } : {}) },
        operationSignal,
      );
    });
  }

  getReconciliationDelta(
    checkpoint?: GitReconciliationCheckpoint,
  ): Promise<GitReconciliationDelta> {
    return this.runOperation(async () => {
      const current = await this.getCurrentReconciliationCheckpoint();
      if (!checkpoint) {
        return {
          mode: "full",
          checkpoint: current,
          reason: "missing-checkpoint",
        };
      }
      if (checkpoint.remoteFingerprint !== this.remoteFingerprint) {
        return {
          mode: "full",
          checkpoint: current,
          reason: "repository-identity-mismatch",
        };
      }
      if (checkpoint.branch !== this.branch) {
        return {
          mode: "full",
          checkpoint: current,
          reason: "branch-mismatch",
        };
      }
      if (!(await this.commitExists(checkpoint.lastReconciledGitHead))) {
        return {
          mode: "full",
          checkpoint: current,
          reason: "missing-local-checkpoint",
        };
      }
      if (
        !(await this.isAncestor(
          checkpoint.lastReconciledGitHead,
          current.lastReconciledGitHead,
        ))
      ) {
        return {
          mode: "full",
          checkpoint: current,
          reason: "non-ancestor-local-checkpoint",
        };
      }

      const localChanges =
        checkpoint.lastReconciledGitHead === current.lastReconciledGitHead
          ? { files: [], deletedFiles: [] }
          : await getChangedPaths(
              this.git,
              checkpoint.lastReconciledGitHead,
              current.lastReconciledGitHead,
            );
      const remoteChanges = await this.getRemoteChanges(checkpoint, current);
      if (!remoteChanges) {
        return {
          mode: "full",
          checkpoint: current,
          reason: "remote-checkpoint-mismatch",
        };
      }

      return {
        mode: "incremental",
        checkpoint: current,
        files: localChanges.files,
        deletedFiles: remoteChanges.deletedFiles,
      };
    });
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

  private async getCurrentReconciliationCheckpoint(): Promise<GitReconciliationCheckpoint> {
    const lastObservedRemoteHead = await tryResolveRemoteHead(
      this.git,
      this.branch,
    );
    return {
      remoteFingerprint: this.remoteFingerprint,
      branch: this.branch,
      lastReconciledGitHead: await this.git.revparse(["HEAD"]),
      ...(lastObservedRemoteHead ? { lastObservedRemoteHead } : {}),
    };
  }

  private async getRemoteChanges(
    previous: GitReconciliationCheckpoint,
    current: GitReconciliationCheckpoint,
  ): Promise<{ deletedFiles: string[] } | undefined> {
    const previousHead = previous.lastObservedRemoteHead;
    const currentHead = current.lastObservedRemoteHead;
    if (!previousHead && !currentHead) return { deletedFiles: [] };
    if (!previousHead || !currentHead) return undefined;
    if (!(await this.commitExists(previousHead))) return undefined;
    if (!(await this.isAncestor(previousHead, currentHead))) return undefined;
    if (previousHead === currentHead) return { deletedFiles: [] };
    const changes = await getChangedPaths(this.git, previousHead, currentHead);
    return { deletedFiles: changes.deletedFiles };
  }

  private async commitExists(commit: string): Promise<boolean> {
    try {
      await this.git.raw(["cat-file", "-e", `${commit}^{commit}`]);
      return true;
    } catch {
      return false;
    }
  }

  private async isAncestor(
    ancestor: string,
    descendant: string,
  ): Promise<boolean> {
    try {
      const mergeBase = await this.git.raw([
        "merge-base",
        ancestor,
        descendant,
      ]);
      return mergeBase.trim() === ancestor;
    } catch {
      return false;
    }
  }

  private runOperation<T>(operation: () => Promise<T>): Promise<T> {
    if (!this.acceptingOperations) {
      return Promise.reject(new Error("Git sync is shutting down"));
    }

    let tracked: Promise<T>;
    try {
      tracked = Promise.resolve(operation()).finally(() => {
        this.activeOperations.delete(tracked);
      });
    } catch (error) {
      return Promise.reject(error);
    }
    this.activeOperations.add(tracked);
    return tracked;
  }
}
