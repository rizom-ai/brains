import type { SimpleGit } from "simple-git";
import simpleGit from "simple-git";
import { existsSync, mkdirSync } from "fs";
import { join, basename } from "path";
import { z } from "zod";
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
    // For GitHub, GitLab, etc., use token as username with 'x-oauth-basic' as password
    // or just the token as password with any username
    url.username = this.authToken;
    url.password = "x-oauth-basic"; // GitHub convention
    return url.toString();
  }

  /**
   * Initialize git repository
   */
  async initialize(): Promise<void> {
    this.logger.debug("Initializing git repository", { gitUrl: this.gitUrl });

    // Git-sync manages its own repository directory
    // Don't use directory-sync's path as that would create nested git repos
    this.repoPath = process.env["GIT_SYNC_TEST_PATH"] ?? "./brain-repo";
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
      // Repository already exists, check if remote matches
      const remotes = await this.git.getRemotes(true);
      const origin = remotes.find((r) => r.name === "origin");

      if (origin && origin.refs.fetch !== this.gitUrl) {
        this.logger.warn("Remote URL mismatch, updating", {
          current: origin.refs.fetch,
          expected: this.gitUrl,
        });
        await this.git.remote([
          "set-url",
          "origin",
          this.getAuthenticatedUrl(),
        ]);
      } else if (!origin && this.gitUrl) {
        await this.git.addRemote("origin", this.getAuthenticatedUrl());
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
    }

    // Configure directory-sync to use our repository path
    const configResponse = await this.sendMessage("sync:configure:request", {
      syncPath: this.repoPath,
    });

    if ("noop" in configResponse || !configResponse.success) {
      this.logger.warn("Could not configure directory-sync", {
        error:
          "noop" in configResponse
            ? "No operation performed"
            : configResponse.error,
        repoPath: this.repoPath,
      });
    } else {
      this.logger.info("Configured directory-sync to use git repository", {
        path: this.repoPath,
      });
    }

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
   * Commit current changes
   */
  async commit(message?: string): Promise<void> {
    const finalMessage = message ?? this.formatCommitMessage();

    // Stage all changes
    await this.git.add(".");

    // Commit
    await this.git.commit(finalMessage);

    this.logger.info("Committed changes", { message: finalMessage });
  }

  /**
   * Push changes to remote
   */
  async push(): Promise<void> {
    try {
      await this.git.push("origin", this.branch);
      this.logger.info("Pushed changes to remote");
    } catch (error) {
      this.logger.error("Failed to push changes", { error });
      throw new Error(
        `Failed to push changes to remote repository: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Pull changes from remote
   */
  async pull(): Promise<void> {
    try {
      // Pull with merge strategy (not rebase) and allow unrelated histories
      await this.git.pull("origin", this.branch, {
        "--no-rebase": null,
        "--allow-unrelated-histories": null,
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
    } catch (error) {
      this.logger.error("Failed to pull changes", { error });
      throw new Error(
        `Failed to pull changes from remote repository: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Perform full sync (export, commit, push, pull)
   */
  async sync(): Promise<void> {
    this.logger.debug("Starting sync");

    try {
      // First, export entities to directory via message bus
      const exportResponse = await this.sendMessage(
        "entity:export:request",
        {},
      );

      if ("noop" in exportResponse || !exportResponse.success) {
        this.logger.warn("No directory sync plugin available for export");
      } else {
        this.logger.info("Exported entities", { result: exportResponse.data });
      }

      // Check if there are changes to commit
      const status = await this.getStatus();

      if (status.hasChanges) {
        await this.commit();
      }

      // Pull before push to handle conflicts
      if (status.remote) {
        try {
          await this.pull();
        } catch (error) {
          this.logger.warn("Pull failed, will try to push anyway", { error });
        }

        // Push if we have commits
        if (status.ahead > 0 || status.hasChanges) {
          await this.push();
        }
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
