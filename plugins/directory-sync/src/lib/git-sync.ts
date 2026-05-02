import type { SimpleGit } from "simple-git";
import simpleGit from "simple-git";
import { getErrorMessage } from "@brains/utils";
import type { Logger } from "@brains/utils";
import type { IGitSync, GitLogEntry } from "../types";
import { getFileHistory, showFileAtCommit } from "./git-history";
import { initializeGitRepository } from "./git-init";
import { getGitStatus, hasGitLocalChanges } from "./git-status";

/**
 * Git sync status
 */
export interface GitSyncStatus {
  isRepo: boolean;
  hasChanges: boolean;
  ahead: number;
  behind: number;
  branch: string;
  lastCommit?: string | undefined;
  remote?: string | undefined;
  files: Array<{ path: string; status: string }>;
}

/**
 * Pull result — files changed by the pull operation
 */
export interface PullResult {
  files: string[];
}

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

  /**
   * Stage and commit all changes.
   */
  async commit(message?: string): Promise<void> {
    const finalMessage = message ?? `Auto-sync: ${new Date().toISOString()}`;

    // Resolve any conflicts by taking local version
    const status = await this.git.status();
    if (status.conflicted.length > 0) {
      this.logger.warn("Resolving conflicts with local version", {
        files: status.conflicted,
      });
      for (const file of status.conflicted) {
        await this.git.raw(["checkout", "--ours", file]);
      }
    }

    await this.git.add(["-A"]);

    // Check for conflict markers in staged files
    const diff = await this.git.diff(["--cached", "--name-only"]);
    for (const file of diff.split("\n").filter((f) => f.trim())) {
      try {
        const content = await this.git.show([`:${file}`]);
        if (
          content.includes("<<<<<<<") ||
          content.includes("=======") ||
          content.includes(">>>>>>>")
        ) {
          throw new Error(
            `Conflict markers found in ${file}. Manual intervention required.`,
          );
        }
      } catch (error) {
        if (error?.toString().includes("Conflict markers found")) throw error;
        // Can't read file (deleted, binary) — skip check
      }
    }

    try {
      await this.git.commit(finalMessage);
      this.logger.info("Committed changes", { message: finalMessage });
    } catch (error) {
      // "nothing to commit" is not an error
      if (!getErrorMessage(error).includes("nothing to commit")) {
        throw error;
      }
    }
  }

  async push(): Promise<void> {
    this.logger.debug("Pushing to origin", { branch: this.branch });
    try {
      await this.git.push("origin", this.branch, ["--set-upstream"]);
    } catch {
      await this.git.push("origin", this.branch);
    }
    this.logger.info("Pushed changes to remote");
  }

  /**
   * Pull changes from remote. Returns the list of changed file paths.
   * Does NOT trigger imports — the caller decides what to do with the files.
   */
  async pull(): Promise<PullResult> {
    this.logger.debug("Pulling from origin", { branch: this.branch });

    // Commit local changes before pulling
    const status = await this.git.status();
    if (!status.isClean()) {
      this.logger.warn("Committing local changes before pull");
      await this.commit("Pre-pull commit: preserving local changes");
    }

    const headBefore = await this.git.revparse(["HEAD"]);

    try {
      await this.git.pull("origin", this.branch, {
        "--no-rebase": null,
        "--allow-unrelated-histories": null,
        "--strategy=recursive": null,
        "-Xtheirs": null,
      });

      const headAfter = await this.git.revparse(["HEAD"]);
      if (headBefore === headAfter) {
        return { files: [] };
      }
      const diff = await this.git.diff([headBefore, headAfter, "--name-only"]);
      return { files: diff.split("\n").filter((f) => f.trim()) };
    } catch (pullError) {
      const msg = getErrorMessage(pullError);

      if (msg.includes("CONFLICT")) {
        this.logger.warn("Resolving merge conflict", { error: msg });
        const mergeStatus = await this.git.status();
        for (const file of mergeStatus.conflicted) {
          try {
            await this.git.raw(["checkout", "--theirs", file]);
          } catch {
            await this.git.raw(["rm", "--force", file]);
          }
        }
        await this.git.add(["-A"]);
        await this.git.commit("Auto-resolve merge conflict (remote wins)");

        const diffOutput = await this.git.diff(["HEAD~1", "--name-only"]);
        return { files: diffOutput.split("\n").filter((f) => f.trim()) };
      }

      if (msg.includes("couldn't find remote ref")) {
        // Remote is empty (no branches) — bootstrap it by committing any
        // pending local changes and pushing to create the remote branch.
        // Without this the initial brain-data content would sit locally
        // forever, never reaching the remote.
        this.logger.info(
          "Remote branch doesn't exist yet, bootstrapping via push",
        );
        try {
          await this.commit("Bootstrap remote branch");
        } catch (commitError) {
          // "nothing to commit" is fine — we still need to push the
          // existing local history to create the remote branch.
          const cmsg = getErrorMessage(commitError);
          if (!cmsg.includes("nothing to commit")) {
            throw commitError;
          }
        }
        await this.push();
        return { files: [] };
      }

      throw new Error(`Failed to pull: ${msg}`);
    }
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
