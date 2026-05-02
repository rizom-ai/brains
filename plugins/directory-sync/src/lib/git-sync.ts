import type { SimpleGit } from "simple-git";
import simpleGit from "simple-git";
import type { Logger } from "@brains/utils";
import type { IGitSync, GitLogEntry } from "../types";
import { commitGitChanges, pushGitChanges } from "./git-commit";
import { getFileHistory, showFileAtCommit } from "./git-history";
import { initializeGitRepository } from "./git-init";
import { pullGitChanges } from "./git-pull";
import type { PullResult } from "./git-pull";
import { getGitStatus, hasGitLocalChanges } from "./git-status";
import type { GitSyncStatus } from "./git-status";

export type { PullResult } from "./git-pull";
export type { GitSyncStatus } from "./git-status";

export interface GitSyncOptions {
  logger: Logger;
  dataDir: string;
  repo?: string | undefined;
  gitUrl?: string | undefined;
  branch?: string | undefined;
  authToken?: string | undefined;
  authorName?: string | undefined;
  authorEmail?: string | undefined;
}

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
  private lockQueue: Promise<void> = Promise.resolve();

  /**
   * Serialize git operations — prevents auto-commit and periodic-sync
   * from racing each other on commit/push/pull.
   */
  withLock<T>(fn: () => Promise<T>): Promise<T> {
    let resolve: (() => void) | undefined;
    const next = new Promise<void>((r) => {
      resolve = r;
    });
    const prev = this.lockQueue;
    this.lockQueue = next;
    return prev.then(async () => {
      try {
        return await fn();
      } finally {
        resolve?.();
      }
    });
  }

  constructor(options: GitSyncOptions) {
    this.logger = options.logger;
    this.dataDir = options.dataDir;
    this.remoteUrl =
      options.gitUrl ??
      (options.repo ? `https://github.com/${options.repo}.git` : "");
    this.branch = options.branch ?? "main";
    this.authorName = options.authorName;
    this.authorEmail = options.authorEmail;
    this.authToken = options.authToken;
  }

  private get git(): SimpleGit {
    this._git ??= simpleGit(this.dataDir);
    return this._git;
  }

  private getAuthenticatedUrl(): string {
    if (!this.authToken || !this.remoteUrl.startsWith("https://")) {
      return this.remoteUrl;
    }
    const url = new URL(this.remoteUrl);
    url.username = this.authToken;
    url.password = "";
    return url.toString();
  }

  /**
   * Initialize git repository — clone, init, or update remote.
   */
  async initialize(): Promise<void> {
    this._git = await initializeGitRepository({
      logger: this.logger,
      dataDir: this.dataDir,
      remoteUrl: this.remoteUrl,
      authenticatedUrl: this.getAuthenticatedUrl(),
      branch: this.branch,
      authorName: this.authorName,
      authorEmail: this.authorEmail,
    });
  }

  hasRemote(): boolean {
    return !!this.remoteUrl;
  }

  async getStatus(): Promise<GitSyncStatus> {
    return getGitStatus(this.git, this.logger, this.branch, this.remoteUrl);
  }

  /**
   * Check if there are uncommitted local changes.
   */
  async hasLocalChanges(): Promise<boolean> {
    return hasGitLocalChanges(this.git);
  }

  async commit(message?: string): Promise<void> {
    await commitGitChanges(this.git, this.logger, message);
  }

  async push(): Promise<void> {
    await pushGitChanges(this.git, this.logger, this.branch);
  }

  async pull(): Promise<PullResult> {
    return pullGitChanges(this.git, this.logger, this.branch);
  }

  async log(filePath: string, limit?: number): Promise<GitLogEntry[]> {
    return getFileHistory(this.git, filePath, limit);
  }

  async show(sha: string, filePath: string): Promise<string> {
    return showFileAtCommit(this.git, sha, filePath);
  }

  cleanup(): void {
    this._git = null;
  }
}
