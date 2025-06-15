import type { Plugin, PluginContext, PluginTool } from "@brains/types";
import { BasePlugin, pluginConfig, validatePluginConfig } from "@brains/utils";
import { GitSync } from "./gitSync";
import {
  gitSyncConfigSchema,
  type GitSyncConfig,
  type GitSyncConfigInput,
} from "./types";
import { GitSyncStatusFormatter } from "./formatters/git-sync-status-formatter";
import { gitSyncStatusSchema } from "./schemas";

/**
 * Git Sync plugin that extends BasePlugin
 * Synchronizes brain data with a git repository
 */
export class GitSyncPlugin extends BasePlugin<GitSyncConfig> {
  private gitSync?: GitSync;

  constructor(config: unknown) {
    // Validate config first
    const validatedConfig = validatePluginConfig(
      gitSyncConfigSchema,
      config,
      "git-sync",
    );

    super(
      "git-sync",
      "Git Sync",
      "Synchronize brain data with a git repository",
      validatedConfig,
    );
  }

  /**
   * Initialize the plugin
   */
  protected override async onRegister(context: PluginContext): Promise<void> {
    const { logger, entityService, formatters } = context;

    // Register our custom formatter
    formatters.register("gitSyncStatus", new GitSyncStatusFormatter());

    // Create GitSync instance
    this.gitSync = new GitSync({
      repoPath: this.config.repoPath,
      remote: this.config.remote,
      branch: this.config.branch,
      autoSync: this.config.autoSync,
      syncInterval: this.config.syncInterval,
      entityService,
      logger,
    });

    // Initialize git repository
    try {
      await this.gitSync.initialize();
      this.info("Git repository initialized successfully", {
        path: this.config.repoPath,
      });
    } catch (error) {
      this.error("Failed to initialize git repository", error);
      throw error; // Fail plugin registration if git init fails
    }

    // Start auto-sync if configured
    if (this.config.autoSync) {
      this.gitSync.startAutoSync().catch((error) => {
        this.error("Failed to start auto-sync", error);
      });
    }
  }

  /**
   * Get the tools provided by this plugin
   */
  protected override async getTools(): Promise<PluginTool[]> {
    if (!this.gitSync) {
      throw new Error("GitSync not initialized");
    }

    return [
      this.createTool(
        "sync",
        "Synchronize all entities with git repository",
        {},
        async (): Promise<{ message: string }> => {
          if (!this.gitSync) {
            throw new Error("GitSync not initialized");
          }
          await this.gitSync.sync();
          return { message: "Sync completed" };
        },
        "anchor", // Only anchor user can sync
      ),

      this.createTool(
        "pull",
        "Pull entities from git repository",
        {},
        async (): Promise<{ message: string }> => {
          if (!this.gitSync) {
            throw new Error("GitSync not initialized");
          }
          await this.gitSync.importFromGit();
          return { message: "Pull completed" };
        },
        "anchor", // Only anchor user can pull
      ),

      this.createTool(
        "push",
        "Push entities to git repository",
        {},
        async (): Promise<{ message: string }> => {
          if (!this.gitSync) {
            throw new Error("GitSync not initialized");
          }
          await this.gitSync.exportToGit();
          return { message: "Push completed" };
        },
        "anchor", // Only anchor user can push
      ),

      this.createTool(
        "status",
        "Get git repository status",
        {},
        async (): Promise<unknown> => {
          if (!this.gitSync) {
            throw new Error("GitSync not initialized");
          }
          const status = await this.gitSync.getStatus();
          // Parse through schema to ensure it has the right structure
          // and the schema description will hint at using gitSyncStatus formatter
          return gitSyncStatusSchema.parse(status);
        },
        "anchor", // Only anchor user can check status
      ),
    ];
  }

  /**
   * Shutdown the plugin
   */
  protected override async onShutdown(): Promise<void> {
    this.gitSync?.stopAutoSync();
  }
}

/**
 * Configuration builder for git-sync plugin
 */
export const gitSyncPluginConfig = (): ReturnType<typeof pluginConfig> =>
  pluginConfig()
    .requiredString("repoPath", "Path to the git repository")
    .optionalString("remote", "Git remote URL (e.g., origin)")
    .optionalString("branch", "Git branch to sync with")
    .boolean("autoSync", false, "Enable automatic synchronization")
    .numberWithDefault("syncInterval", 300000, {
      description: "Sync interval in milliseconds",
      min: 60000, // 1 minute minimum
    })
    .describe("Configuration for the git-sync plugin");

/**
 * Factory function for creating git sync plugin
 */
export function gitSync(config: GitSyncConfigInput): Plugin {
  return new GitSyncPlugin(config);
}
