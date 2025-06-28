import type { Plugin, PluginContext, PluginTool } from "@brains/types";
import { BasePlugin } from "@brains/utils";
import { GitSyncInitializationError } from "./errors";
import { z } from "zod";
import { GitSync } from "./gitSync";
import {
  gitSyncConfigSchema,
  type GitSyncConfig,
  type GitSyncConfigInput,
} from "./types";
import { GitSyncStatusFormatter } from "./formatters/git-sync-status-formatter";
import { gitSyncStatusSchema } from "./schemas";
import packageJson from "../package.json";

/**
 * Git Sync plugin that extends BasePlugin
 * Adds git version control to directory-sync
 */
export class GitSyncPlugin extends BasePlugin<GitSyncConfig> {
  private gitSync?: GitSync;

  constructor(config: unknown) {
    super("git-sync", packageJson, config, gitSyncConfigSchema);
  }

  /**
   * Initialize the plugin
   */
  protected override async onRegister(context: PluginContext): Promise<void> {
    const { logger } = context;

    // Register our template for git sync status
    context.registerTemplate("status", {
      name: "status",
      description: "Git synchronization status",
      schema: gitSyncStatusSchema,
      basePrompt: "",
      formatter: new GitSyncStatusFormatter(), // Use status formatter for template
    });

    // Create GitSync instance
    this.gitSync = new GitSync({
      gitUrl: this.config.gitUrl,
      branch: this.config.branch,
      autoSync: this.config.autoSync,
      syncInterval: this.config.syncInterval * 60, // Convert minutes to seconds
      commitMessage: this.config.commitMessage,
      authorName: this.config.authorName,
      authorEmail: this.config.authorEmail,
      authToken: this.config.authToken,
      sendMessage: context.sendMessage,
      logger,
    });

    // Initialize repository
    await this.gitSync.initialize();
  }

  /**
   * Define the tools provided by this plugin
   */
  override async getTools(): Promise<PluginTool[]> {
    return [
      {
        name: "git-sync:sync",
        description: "Perform full git sync (export, commit, push, pull)",
        inputSchema: {},
        visibility: "anchor", // Only anchor user can sync
        handler: async (): Promise<{ message: string }> => {
          if (!this.gitSync) {
            throw new GitSyncInitializationError(
              "Git sync service not initialized",
              "Plugin not properly configured",
              { tool: "git-sync" }
            );
          }
          await this.gitSync.sync();
          return {
            message: "Git sync completed successfully",
          };
        },
      },

      {
        name: "git-sync:commit",
        description: "Commit current changes",
        inputSchema: {
          commitMessage: z.string().optional(),
        },
        visibility: "anchor", // Only anchor user can commit
        handler: async (input: unknown): Promise<{ message: string }> => {
          const { commitMessage } = input as { commitMessage?: string };
          if (!this.gitSync) {
            throw new GitSyncInitializationError(
              "Git sync service not initialized",
              "Plugin not properly configured",
              { tool: "git-sync" }
            );
          }
          await this.gitSync.commit(commitMessage);
          return {
            message: "Changes committed successfully",
          };
        },
      },

      {
        name: "git-sync:push",
        description: "Push commits to remote repository",
        inputSchema: {},
        visibility: "anchor", // Only anchor user can push
        handler: async (): Promise<{ message: string }> => {
          if (!this.gitSync) {
            throw new GitSyncInitializationError(
              "Git sync service not initialized",
              "Plugin not properly configured",
              { tool: "git-sync" }
            );
          }
          await this.gitSync.push();
          return {
            message: "Pushed to remote successfully",
          };
        },
      },

      {
        name: "git-sync:pull",
        description: "Pull changes from remote repository",
        inputSchema: {},
        visibility: "anchor", // Only anchor user can pull
        handler: async (): Promise<{ message: string }> => {
          if (!this.gitSync) {
            throw new GitSyncInitializationError(
              "Git sync service not initialized",
              "Plugin not properly configured",
              { tool: "git-sync" }
            );
          }
          await this.gitSync.pull();
          return {
            message: "Pulled from remote successfully",
          };
        },
      },

      {
        name: "git-sync:status",
        description: "Get git repository status",
        inputSchema: {},
        visibility: "public", // Anyone can check status
        handler: async (): Promise<unknown> => {
          if (!this.gitSync) {
            throw new GitSyncInitializationError(
              "Git sync service not initialized",
              "Plugin not properly configured",
              { tool: "git-sync" }
            );
          }
          return this.gitSync.getStatus();
        },
      },

      {
        name: "git-sync:auto-sync",
        description: "Start or stop automatic synchronization",
        inputSchema: {
          autoSync: z.boolean(),
        },
        visibility: "anchor", // Only anchor user can control auto-sync
        handler: async (input: unknown): Promise<{ message: string }> => {
          const { autoSync } = input as { autoSync: boolean };
          if (!this.gitSync) {
            throw new GitSyncInitializationError(
              "Git sync service not initialized",
              "Plugin not properly configured",
              { tool: "git-sync" }
            );
          }

          if (autoSync) {
            this.gitSync.startAutoSync();
            return { message: "Auto-sync started" };
          } else {
            this.gitSync.stopAutoSync();
            return { message: "Auto-sync stopped" };
          }
        },
      },
    ];
  }

  /**
   * Cleanup when plugin is unregistered
   */
  protected async onUnregister(): Promise<void> {
    if (this.gitSync) {
      await this.gitSync.cleanup();
    }
  }
}

/**
 * Factory function to create a git sync plugin
 */
export function gitSync(config: GitSyncConfigInput): Plugin {
  return new GitSyncPlugin(config);
}
