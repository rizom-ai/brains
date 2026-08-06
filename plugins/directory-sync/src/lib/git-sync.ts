import type { SimpleGit } from "simple-git";
import simpleGit from "simple-git";
import type { Logger } from "@brains/utils/logger";
import type {
  GitLogEntry,
  GitSyncStatus,
  IGitSync,
  PullResult,
} from "../types";
import { commitGitChanges, pushGitChanges } from "./git-commit";
import { getFileHistory, showFileAtCommit } from "./git-history";
import { initializeGitRepository } from "./git-init";
import { GitOperationLock } from "./git-lock";
import {
  DEFAULT_GIT_TIMEOUT_MS,
  getAuthenticatedGitUrl,
  resolveGitRemoteUrl,
} from "./git-options";
import type { GitSyncOptions } from "./git-options";
import { pullGitChanges } from "./git-pull";
import { getGitStatus, hasGitLocalChanges } from "./git-status";

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
  private readonly branch: string;
  private readonly authorName: string | undefined;
  private readonly authorEmail: string | undefined;
  private readonly authToken: string | undefined;
  private readonly dataDir: string;
  private readonly timeoutMs: number;
  private readonly lock = new GitOperationLock();
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

  pull(signal?: AbortSignal): Promise<PullResult> {
    return this.runOperation(() =>
      pullGitChanges(
        this.git,
        this.logger,
        this.branch,
        this.net,
        this.getOperationSignal(signal),
      ),
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
