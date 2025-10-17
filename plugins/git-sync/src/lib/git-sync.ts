import type { SimpleGit } from "simple-git";
import simpleGit from "simple-git";
import { existsSync, mkdirSync, writeFileSync } from "fs";
import { join, basename } from "path";
import { z } from "@brains/utils";
import type { CorePluginContext } from "@brains/plugins";

/**
 * GitSync options schema
 */
export const gitSyncOptionsSchema = z.object({
  gitUrl: z.string(),
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
  private sendMessage: CorePluginContext["sendMessage"];
  private logger: CorePluginContext["logger"];
  private gitUrl: string;
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

  constructor(options: GitSyncOptions) {
    // Extract what we need from the context
    const { logger, sendMessage } = options;

    this.sendMessage = sendMessage;
    this.logger = logger;
    this.gitUrl = options.gitUrl;
    this.branch = options.branch;
    this.autoSync = options.autoSync;
    this.syncInterval = options.syncInterval;
    this.commitMessage = options.commitMessage ?? "Auto-sync: {date}";
    this.authorName = options.authorName;
    this.authorEmail = options.authorEmail;
    this.authToken = options.authToken;
    this.autoPush = options.autoPush ?? false;
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
    if (!this.authToken || !this.gitUrl.startsWith("https://")) {
      return this.gitUrl;
    }

    // Parse the URL and insert authentication
    const url = new URL(this.gitUrl);
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
    this.logger.debug("Initializing git repository", { gitUrl: this.gitUrl });

    // Use the directory-sync path (brain-data) or test path
    // Git will initialize inside the same directory that directory-sync manages
    this.repoPath = process.env["GIT_SYNC_TEST_PATH"] ?? "./brain-data";
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
        gitUrl: this.gitUrl,
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
      if (this.gitUrl) {
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
      } else if (this.gitUrl) {
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
   * Get current git status
   */
  async getStatus(): Promise<GitSyncStatus> {
    try {
      const status = await this.git.status();
      const isRepo = await this.git.checkIsRepo();

      // Get ahead/behind count
      let ahead = 0;
      let behind = 0;

      try {
        const branchStatus = await this.git.branch();
        const currentBranch = branchStatus.branches[branchStatus.current];
        if (
          currentBranch &&
          "tracking" in currentBranch &&
          "label" in currentBranch
        ) {
          // Parse ahead/behind from label (e.g., "ahead 1, behind 2")
          const match = currentBranch.label.match(/ahead (\d+)|behind (\d+)/g);
          if (match) {
            match.forEach((m) => {
              if (m.startsWith("ahead"))
                ahead = parseInt(m.split(" ")[1] ?? "0");
              if (m.startsWith("behind"))
                behind = parseInt(m.split(" ")[1] ?? "0");
            });
          }
        }
      } catch {
        // Ignore errors getting branch status
      }

      // Get last commit
      let lastCommit: string | undefined;
      try {
        const log = await this.git.log({ maxCount: 1 });
        lastCommit = log.latest?.hash;
      } catch {
        // No commits yet
      }

      // Get remote URL
      let remote: string | undefined;
      try {
        const remotes = await this.git.getRemotes(true);
        remote = remotes.find((r) => r.name === "origin")?.refs.fetch;
      } catch {
        // No remotes
      }

      return {
        isRepo,
        hasChanges: !status.isClean(),
        ahead,
        behind,
        branch: status.current ?? this.branch,
        lastCommit,
        remote,
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
      this.logger.warn(
        "Found conflicted files, resolving with remote version",
        {
          files: status.conflicted,
        },
      );

      // Resolve conflicts by taking remote version
      for (const file of status.conflicted) {
        await this.git.raw(["checkout", "--theirs", file]);
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
      // Origin is already configured with authentication
      this.logger.debug("Pulling from origin", { branch: this.branch });

      // First check if the remote branch exists
      try {
        await this.git.fetch("origin", this.branch);
      } catch (fetchError) {
        const errorMessage =
          fetchError instanceof Error ? fetchError.message : String(fetchError);
        if (errorMessage.includes("couldn't find remote ref")) {
          this.logger.info("Remote branch doesn't exist yet, skipping pull");
          return false; // Return false to indicate branch doesn't exist
        }
        throw fetchError;
      }

      // Check for local changes before pulling - this should not happen if called from sync()
      // but might happen if pull() is called directly
      const status = await this.git.status();
      if (!status.isClean()) {
        this.logger.warn(
          "Found uncommitted changes before pull - this may cause conflicts",
          {
            files: status.files.map((f) => f.path),
          },
        );
        // Commit them to prevent pull from failing
        await this.commit("Pre-pull commit: preserving local changes");
      }

      // Pull with merge strategy, auto-resolving conflicts using remote version
      await this.git.pull("origin", this.branch, {
        "--no-rebase": null,
        "--allow-unrelated-histories": null,
        "--strategy=recursive": null,
        "-Xtheirs": null, // Automatically resolve conflicts using remote version
      });
      this.logger.info("Pulled changes from remote");

      // After pull, import entities via message bus
      const importResponse = await this.sendMessage(
        "entity:import:request",
        {},
      );

      if ("noop" in importResponse || !importResponse.success) {
        this.logger.warn("No directory sync plugin available for import");
      } else {
        this.logger.info("Imported entities after pull", {
          result: importResponse.data,
        });
      }

      return true; // Return true for successful pull
    } catch (error) {
      this.logger.error("Failed to pull changes", { error });
      throw new Error(
        `Failed to pull changes from remote repository: ${error instanceof Error ? error.message : String(error)}`,
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
      // Get initial status to check for local changes
      const initialStatus = await this.getStatus();

      // Track if we made a commit during this sync
      let madeCommit = false;

      // Commit any local changes FIRST (including deletions)
      // This ensures deletions are preserved before pulling
      if (initialStatus.hasChanges) {
        await this.commit();
        this.logger.info("Committed local changes");
        madeCommit = true;
      }

      // Only pull if we didn't make a commit
      // If we made a commit, we just want to push it, not pull and potentially create merge conflicts
      let remoteBranchExists = true;
      if (initialStatus.remote && !madeCommit) {
        try {
          // pull() returns false if remote branch doesn't exist
          remoteBranchExists = await this.pull();
        } catch (error) {
          this.logger.warn("Pull failed", { error });
          throw error;
        }
      } else if (madeCommit) {
        this.logger.debug("Skipping pull because we made a local commit");
      }

      // Get status after commit and pull to see current state
      const currentStatus = await this.getStatus();

      // Push if:
      // 1. Manual sync (always push on manual sync if we have commits)
      // 2. AutoPush is enabled and we made a commit (or have uncommitted changes or are ahead)
      // 3. Remote branch doesn't exist and we have commits to push
      const manualSyncWithCommit =
        manualSync && Boolean(currentStatus.lastCommit);
      const autoPushCondition =
        this.autoPush &&
        Boolean(initialStatus.remote) &&
        (madeCommit || currentStatus.hasChanges || currentStatus.ahead > 0);
      const needsInitialPush =
        !remoteBranchExists && Boolean(currentStatus.lastCommit);

      const shouldPush =
        manualSyncWithCommit || autoPushCondition || needsInitialPush;

      if (shouldPush) {
        await this.push();
        this.logger.info("Pushed changes to remote", {
          manual: manualSync,
          createBranch: !remoteBranchExists,
        });
      } else if (!remoteBranchExists && !currentStatus.lastCommit) {
        this.logger.debug("No commits to push to create remote branch");
      }

      this.logger.info("Sync completed successfully");
    } catch (error) {
      this.logger.error("Sync failed", { error });
      throw new Error(
        `Git synchronization failed: ${error instanceof Error ? error.message : String(error)}`,
      );
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
          await this.sync();
        } catch (error) {
          this.logger.error("Auto-sync failed", { error });
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
