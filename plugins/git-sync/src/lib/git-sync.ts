import type { SimpleGit } from "simple-git";
import simpleGit from "simple-git";
import { existsSync, mkdirSync, writeFileSync } from "fs";
import { join, basename } from "path";
import { getErrorMessage, z } from "@brains/utils";
import type { CorePluginContext } from "@brains/plugins";

/**
 * GitSync options schema
 */
export const gitSyncOptionsSchema = z.object({
  repo: z.string().optional(),
  gitUrl: z.string().optional(),
  branch: z.string().default("main"),
  autoSync: z.boolean().default(false),
  syncInterval: z.number().default(300),
  commitMessage: z.string().optional(),
  authorName: z.string().optional(),
  authorEmail: z.string().optional(),
  authToken: z.string().optional(),
  autoPush: z.boolean().optional(),
});

export type GitSyncOptions = z.infer<typeof gitSyncOptionsSchema> &
  CorePluginContext;

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
  files: Array<{
    path: string;
    status: string;
  }>;
}

/**
 * GitSync handles git operations for a directory managed by directory-sync
 */
export class GitSync {
  private _git: SimpleGit | null = null;
  private sendMessage: CorePluginContext["messaging"]["send"];
  private logger: CorePluginContext["logger"];
  private remoteUrl: string;
  private branch: string;
  private autoSync: boolean;
  private syncInterval: number;
  private commitMessage: string;
  private authorName: string | undefined;
  private authorEmail: string | undefined;
  private authToken: string | undefined;
  private autoPush: boolean;
  private syncTimer: Timer | undefined;
  private repoPath: string = "";
  private dataDir: string;

  constructor(options: GitSyncOptions) {
    // Extract what we need from the context
    const { logger, messaging, dataDir } = options;

    this.sendMessage = messaging.send;
    this.logger = logger;
    this.remoteUrl =
      options.gitUrl ??
      (options.repo ? `https://github.com/${options.repo}.git` : "");
    this.branch = options.branch;
    this.autoSync = options.autoSync;
    this.syncInterval = options.syncInterval;
    this.commitMessage = options.commitMessage ?? "Auto-sync: {date}";
    this.authorName = options.authorName;
    this.authorEmail = options.authorEmail;
    this.authToken = options.authToken;
    this.autoPush = options.autoPush ?? false;
    this.dataDir = dataDir;
  }

  /**
   * Lazy getter for git instance
   */
  private get git(): SimpleGit {
    this._git ??= simpleGit(this.repoPath);
    return this._git;
  }

  /**
   * Get authenticated git URL
   */
  private getAuthenticatedUrl(): string {
    if (!this.authToken || !this.remoteUrl.startsWith("https://")) {
      return this.remoteUrl;
    }

    // Parse the URL and insert authentication
    const url = new URL(this.remoteUrl);
    // GitHub PATs should be used as the username with empty password
    // Format: https://TOKEN@github.com/user/repo.git (no colon after token)
    url.username = this.authToken;
    url.password = "";
    return url.toString();
  }

  /**
   * Initialize git repository
   */
  async initialize(): Promise<void> {
    this.logger.debug("Initializing git repository", {
      gitUrl: this.remoteUrl,
    });

    // Use the centralized data directory from context
    this.repoPath = this.dataDir;
    this.logger.info("Using git repository path", { path: this.repoPath });

    // Clone or initialize repository
    if (!existsSync(this.repoPath)) {
      mkdirSync(this.repoPath, { recursive: true });

      // Skip cloning if .git already exists (e.g., in tests)
      if (existsSync(join(this.repoPath, ".git"))) {
        this.logger.debug("Git repository already exists, skipping clone");
        return;
      }

      // Clone the repository
      this.logger.info("Cloning repository", {
        gitUrl: this.remoteUrl,
        path: this.repoPath,
      });
      const parentDir = join(this.repoPath, "..");
      const repoName = basename(this.repoPath);

      await simpleGit(parentDir).clone(this.getAuthenticatedUrl(), repoName);
      this._git = simpleGit(this.repoPath);
    } else if (!existsSync(join(this.repoPath, ".git"))) {
      // Initialize new repository
      this.logger.info("Initializing new repository", { path: this.repoPath });
      await this.git.init();

      // Add remote if URL provided
      if (this.remoteUrl) {
        await this.git.addRemote("origin", this.getAuthenticatedUrl());
      }
    } else {
      // Repository already exists, always update remote to use authenticated URL
      const authUrl = this.getAuthenticatedUrl();

      // First check if origin exists
      const remotes = await this.git.getRemotes(true);
      const origin = remotes.find((r) => r.name === "origin");

      if (origin) {
        // Always update to ensure we have the authenticated URL
        this.logger.debug("Updating remote URL with authentication");
        await this.git.remote(["set-url", "origin", authUrl]);
      } else if (this.remoteUrl) {
        // No origin, add it with authentication
        this.logger.debug("Adding remote with authentication");
        await this.git.addRemote("origin", authUrl);
      }
    }

    // Set up git config
    if (this.authorName) {
      await this.git.addConfig("user.name", this.authorName);
    }
    if (this.authorEmail) {
      await this.git.addConfig("user.email", this.authorEmail);
    }

    // Set pull strategy to avoid divergent branches error
    await this.git.addConfig("pull.rebase", "false");

    // Checkout branch
    try {
      await this.git.checkout(this.branch);
    } catch {
      // Branch doesn't exist, create it
      await this.git.checkoutLocalBranch(this.branch);

      // For new repositories, create an initial commit so there's a HEAD to push
      const log = await this.git.log().catch(() => ({ all: [] }));

      if (log.all.length === 0) {
        // No commits yet - create initial commit
        this.logger.info("Creating initial commit for empty repository");

        // Create a .gitkeep file to have something to commit
        const gitkeepPath = join(this.repoPath, ".gitkeep");
        if (!existsSync(gitkeepPath)) {
          writeFileSync(gitkeepPath, "");
        }

        await this.git.add(".gitkeep");
        await this.git.commit("Initial commit");
        this.logger.info("Created initial commit");
      }
    }

    // Don't pull here - wait for system:plugins:ready event to ensure
    // all entity types are registered before importing files

    // No need to reconfigure directory-sync - it's already using the same directory

    // Start auto-sync if enabled
    if (this.autoSync) {
      this.startAutoSync();
    }
  }

  /**
   * Check if a remote URL is configured (no subprocess call)
   */
  hasRemote(): boolean {
    return !!this.remoteUrl;
  }

  /**
   * Get current git status
   * Uses git.status() for most info (1 subprocess) + git.log() for last commit (1 subprocess)
   */
  async getStatus(): Promise<GitSyncStatus> {
    try {
      const status = await this.git.status();

      // Get last commit
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
   * Commit current changes (including deletions)
   */
  async commit(message?: string): Promise<void> {
    const finalMessage = message ?? this.formatCommitMessage();

    // Check for conflict markers before committing
    const status = await this.git.status();

    // Check if we have conflicted files
    if (status.conflicted.length > 0) {
      this.logger.warn("Found conflicted files, resolving with local version", {
        files: status.conflicted,
      });

      // Resolve conflicts by taking local version (preserves our changes)
      for (const file of status.conflicted) {
        await this.git.raw(["checkout", "--ours", file]);
      }
    }

    // Stage all changes including deletions (equivalent to git add -A)
    await this.git.add(["-A"]);

    // Final safety check: ensure no conflict markers in staged files
    const diff = await this.git.diff(["--cached", "--name-only"]);
    const files = diff.split("\n").filter((f) => f.trim());

    for (const file of files) {
      if (!file) continue;

      try {
        // Check file content for conflict markers
        const content = await this.git.show([`:${file}`]);
        if (
          content.includes("<<<<<<<") ||
          content.includes("=======") ||
          content.includes(">>>>>>>")
        ) {
          this.logger.error(
            "Conflict markers detected in file, aborting commit",
            { file },
          );
          throw new Error(
            `Conflict markers found in ${file}. Manual intervention required.`,
          );
        }
      } catch (error) {
        // If we can't read the file (deleted, binary, etc.), skip the check
        if (!error?.toString().includes("Conflict markers found")) {
          // Only skip if it's not our own error
          continue;
        }
        throw error;
      }
    }

    // Commit
    await this.git.commit(finalMessage);

    this.logger.info("Committed changes", { message: finalMessage });
  }

  /**
   * Push changes to remote
   */
  async push(): Promise<void> {
    // Origin is already configured with authentication
    this.logger.debug("Pushing to origin", { branch: this.branch });

    try {
      // Try to push with upstream tracking on first push
      await this.git.push("origin", this.branch, ["--set-upstream"]);
      this.logger.info("Pushed changes to remote");
    } catch (firstError) {
      this.logger.warn("First push attempt failed", { error: firstError });

      // If that fails, try a regular push without --set-upstream
      try {
        await this.git.push("origin", this.branch);
        this.logger.info("Pushed changes to remote");
      } catch (fallbackError) {
        this.logger.error("Both push attempts failed", {
          firstError,
          fallbackError,
        });
        throw new Error(
          `Failed to push changes to remote repository: ${fallbackError instanceof Error ? fallbackError.message : String(fallbackError)}`,
        );
      }
    }
  }

  /**
   * Pull changes from remote
   * @returns true if pull succeeded, false if remote branch doesn't exist
   */
  async pull(): Promise<boolean> {
    try {
      this.logger.debug("Pulling from origin", { branch: this.branch });

      // Commit local changes before pulling to prevent conflicts
      const status = await this.git.status();
      if (!status.isClean()) {
        this.logger.warn(
          "Found uncommitted changes before pull - committing first",
          { files: status.files.map((f) => f.path) },
        );
        await this.commit("Pre-pull commit: preserving local changes");
      }

      // Pull (includes fetch + merge). Fast when nothing to merge.
      const pullResult = await this.git.pull("origin", this.branch, {
        "--no-rebase": null,
        "--allow-unrelated-histories": null,
        "--strategy=recursive": null,
        "-Xtheirs": null,
      });

      // Skip import if nothing changed
      if (pullResult.files.length === 0) {
        this.logger.debug(
          "Pull completed with no file changes, skipping import",
        );
        return true;
      }

      this.logger.info("Pulled changes from remote", {
        filesChanged: pullResult.files.length,
      });

      // Only import the files that actually changed
      const importResponse = await this.sendMessage("entity:import:request", {
        paths: pullResult.files,
      });

      if ("noop" in importResponse || !importResponse.success) {
        this.logger.warn("No directory sync plugin available for import");
      } else {
        this.logger.info("Imported entities after pull", {
          result: importResponse.data,
        });
      }

      return true;
    } catch (error) {
      const errorMessage = getErrorMessage(error);
      if (errorMessage.includes("couldn't find remote ref")) {
        this.logger.info("Remote branch doesn't exist yet, skipping pull");
        return false;
      }
      this.logger.error("Failed to pull changes", { error });
      throw new Error(
        `Failed to pull changes from remote repository: ${errorMessage}`,
      );
    }
  }

  /**
   * Perform full sync (commit local changes, pull, push)
   * @param manualSync - Whether this sync was triggered manually (always push if true)
   */
  async sync(manualSync = false): Promise<void> {
    this.logger.debug("Starting sync", { manual: manualSync });

    try {
      // STEP 1: Pull from remote if configured
      let remoteBranchExists = true;
      if (this.remoteUrl) {
        try {
          remoteBranchExists = await this.pull();
        } catch (error) {
          this.logger.warn("Pull failed", { error });
          throw error;
        }
      }

      // STEP 2: Commit any local changes (after pulling)
      const status = await this.git.status();
      if (!status.isClean()) {
        await this.commit();
        this.logger.info("Committed local changes");
      }

      // STEP 3: Push if needed
      if (this.remoteUrl) {
        const postCommitStatus = await this.git.status();
        const shouldPush =
          manualSync ||
          (this.autoPush && postCommitStatus.ahead > 0) ||
          !remoteBranchExists;

        if (shouldPush) {
          await this.push();
          this.logger.info("Pushed changes to remote", {
            manual: manualSync,
            ahead: postCommitStatus.ahead,
          });
        }
      }

      this.logger.info("Sync completed successfully");
    } catch (error) {
      this.logger.error("Sync failed", { error });
      throw new Error(`Git synchronization failed: ${getErrorMessage(error)}`);
    }
  }

  /**
   * Start automatic synchronization
   */
  startAutoSync(): void {
    if (this.syncTimer) {
      return;
    }

    this.logger.info("Starting auto-sync", { interval: this.syncInterval });

    this.syncTimer = setInterval((): void => {
      void (async (): Promise<void> => {
        try {
          await this.pull();
        } catch (error) {
          this.logger.error("Auto-pull failed", { error });
        }
      })();
    }, this.syncInterval * 1000);
  }

  /**
   * Stop automatic synchronization
   */
  stopAutoSync(): void {
    if (this.syncTimer) {
      clearInterval(this.syncTimer);
      this.syncTimer = undefined;
      this.logger.info("Stopped auto-sync");
    }
  }

  /**
   * Format commit message with template variables
   */
  private formatCommitMessage(): string {
    return this.commitMessage
      .replace("{date}", new Date().toISOString())
      .replace("{timestamp}", Date.now().toString());
  }

  /**
   * Cleanup resources
   */
  async cleanup(): Promise<void> {
    this.stopAutoSync();
  }
}
