import type { SimpleGit } from "simple-git";
import simpleGit from "simple-git";
import { mkdir, writeFile, access } from "fs/promises";
import { join, basename } from "path";
import { getErrorMessage } from "@brains/utils";
import type { Logger } from "@brains/utils";
import type { IGitSync, GitLogEntry } from "../types";
import { getFileHistory, showFileAtCommit } from "./git-history";

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
    this.logger.debug("Initializing git repository", {
      gitUrl: this.remoteUrl,
    });

    await mkdir(this.dataDir, { recursive: true });

    const gitDirExists = await access(join(this.dataDir, ".git")).then(
      () => true,
      () => false,
    );
    if (!gitDirExists) {
      if (this.remoteUrl) {
        // Try to clone
        this.logger.info("Cloning repository", { gitUrl: this.remoteUrl });
        const parentDir = join(this.dataDir, "..");
        const repoName = basename(this.dataDir);
        try {
          await simpleGit(parentDir).clone(
            this.getAuthenticatedUrl(),
            repoName,
          );
          this._git = simpleGit(this.dataDir);
        } catch {
          // Clone failed (empty repo?) — init locally and add remote
          this.logger.info("Clone failed, initializing locally");
          await this.git.init();
          await this.git.addRemote("origin", this.getAuthenticatedUrl());
        }
      } else {
        await this.git.init();
      }
    } else if (this.remoteUrl) {
      // Repo exists — update remote URL
      const remotes = await this.git.getRemotes(true);
      const origin = remotes.find((r) => r.name === "origin");
      if (origin) {
        await this.git.remote([
          "set-url",
          "origin",
          this.getAuthenticatedUrl(),
        ]);
      } else {
        await this.git.addRemote("origin", this.getAuthenticatedUrl());
      }
    }

    // Configure git identity
    if (this.authorName) {
      await this.git.addConfig("user.name", this.authorName);
    }
    if (this.authorEmail) {
      await this.git.addConfig("user.email", this.authorEmail);
    }
    await this.git.addConfig("pull.rebase", "false");

    // Ensure we're on the configured branch. Only create it when the
    // checkout failed because the branch does not exist yet.
    try {
      await this.git.checkout(this.branch);
    } catch (error) {
      const message = getErrorMessage(error);
      const branchMissing =
        message.includes(`pathspec '${this.branch}' did not match`) ||
        message.includes(`invalid reference: ${this.branch}`) ||
        message.includes("did not match any file(s) known to git");

      if (!branchMissing) {
        throw error;
      }

      await this.git.checkoutLocalBranch(this.branch);

      // Create initial commit if empty. Stage ANY existing files in the
      // working tree (seed content, pre-populated brain-data) so the
      // first commit captures them — otherwise the initial commit would
      // contain only .gitkeep and the seed files would sit uncommitted
      // forever until the first entity change triggered auto-commit.
      const log = await this.git.log().catch(() => ({ all: [] }));
      if (log.all.length === 0) {
        await this.git.add("-A");
        const status = await this.git.status();
        if (status.staged.length === 0 && status.created.length === 0) {
          // Truly empty working tree — fall back to .gitkeep so we have
          // something to commit and a branch to check out.
          const gitkeepPath = join(this.dataDir, ".gitkeep");
          const gitkeepExists = await access(gitkeepPath).then(
            () => true,
            () => false,
          );
          if (!gitkeepExists) {
            await writeFile(gitkeepPath, "");
          }
          await this.git.add(".gitkeep");
        }
        await this.git.commit("Initial commit");
      }
    }
  }

  hasRemote(): boolean {
    return !!this.remoteUrl;
  }

  async getStatus(): Promise<GitSyncStatus> {
    try {
      const status = await this.git.status();
      let lastCommit: string | undefined;
      try {
        const log = await this.git.log({ maxCount: 1 });
        lastCommit = log.latest?.hash;
      } catch {
        // No commits yet
      }
      return {
        isRepo: true,
        hasChanges: !status.isClean(),
        ahead: status.ahead,
        behind: status.behind,
        branch: status.current ?? this.branch,
        lastCommit,
        remote: this.remoteUrl || undefined,
        files: status.files.map((f) => ({
          path: f.path,
          status: f.working_dir + f.index,
        })),
      };
    } catch (error) {
      this.logger.error("Failed to get git status", { error });
      return {
        isRepo: false,
        hasChanges: false,
        ahead: 0,
        behind: 0,
        branch: this.branch,
        files: [],
      };
    }
  }

  /**
   * Check if there are uncommitted local changes.
   */
  async hasLocalChanges(): Promise<boolean> {
    const status = await this.git.status();
    return (
      status.modified.length > 0 ||
      status.not_added.length > 0 ||
      status.deleted.length > 0 ||
      status.created.length > 0 ||
      status.conflicted.length > 0
    );
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
