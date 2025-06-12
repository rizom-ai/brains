import type {
  Plugin,
  PluginContext,
  PluginCapabilities,
  PluginTool,
} from "@brains/types";
import { validatePluginConfig } from "@brains/utils";
import { GitSync } from "./gitSync";
import {
  gitSyncConfigSchema,
  type GitSyncConfig,
  type GitSyncConfigInput,
} from "./types";
import { GitSyncStatusFormatter } from "./formatters/git-sync-status-formatter";
import { gitSyncStatusSchema } from "./schemas";

export class GitSyncPlugin implements Plugin {
  id = "git-sync";
  name = "Git Sync";
  version = "1.0.0";
  description = "Synchronize brain data with a git repository";

  private gitSync: GitSync | null = null;
  private config: GitSyncConfig;

  constructor(config: GitSyncConfigInput) {
    // Validate config with helpful error messages
    this.config = validatePluginConfig(gitSyncConfigSchema, config, "git-sync");
  }

  async register(context: PluginContext): Promise<PluginCapabilities> {
    const { logger, entityService, formatters } = context;

    // Register our custom formatter
    formatters.register("gitSyncStatus", new GitSyncStatusFormatter());

    // Note: We no longer need BrainProtocol - tools are the only interface

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

    // Initialize git repository (now we can await it!)
    try {
      await this.gitSync.initialize();
      logger.info("Git repository initialized successfully", {
        path: this.config.repoPath,
      });
    } catch (error) {
      logger.error("Failed to initialize git repository", {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      });
      throw error; // Fail plugin registration if git init fails
    }

    // Define plugin tools
    const tools: PluginTool[] = [
      {
        name: "git_sync",
        description: "Synchronize all entities with git repository",
        inputSchema: {},
        handler: async (): Promise<{ message: string }> => {
          if (!this.gitSync) {
            throw new Error("GitSync not initialized");
          }
          await this.gitSync.sync();
          return { message: "Sync completed" };
        },
      },
      {
        name: "git_sync_pull",
        description: "Pull entities from git repository",
        inputSchema: {},
        handler: async (): Promise<{ message: string }> => {
          if (!this.gitSync) {
            throw new Error("GitSync not initialized");
          }
          await this.gitSync.importFromGit();
          return { message: "Pull completed" };
        },
      },
      {
        name: "git_sync_push",
        description: "Push entities to git repository",
        inputSchema: {},
        handler: async (): Promise<{ message: string }> => {
          if (!this.gitSync) {
            throw new Error("GitSync not initialized");
          }
          await this.gitSync.exportToGit();
          return { message: "Push completed" };
        },
      },
      {
        name: "git_sync_status",
        description: "Get git repository status",
        inputSchema: {},
        handler: async (): Promise<unknown> => {
          if (!this.gitSync) {
            throw new Error("GitSync not initialized");
          }
          const status = await this.gitSync.getStatus();
          // Parse through schema to ensure it has the right structure
          // and the schema description will hint at using gitSyncStatus formatter
          return gitSyncStatusSchema.parse(status);
        },
      },
    ];

    logger.info("Git sync plugin registered", {
      tools: tools.map((t) => t.name),
    });

    // Start auto-sync if configured
    if (this.config.autoSync) {
      this.gitSync.startAutoSync().catch((error) => {
        logger.error("Failed to start auto-sync", error);
      });
    }

    // Return plugin capabilities
    return {
      tools,
      resources: [], // No resources for git-sync plugin
    };
  }

  async shutdown(): Promise<void> {
    this.gitSync?.stopAutoSync();
  }
}

/**
 * Factory function for creating git sync plugin
 */
export function gitSync(config: GitSyncConfigInput): GitSyncPlugin {
  return new GitSyncPlugin(config);
}
