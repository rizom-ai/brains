import type {
  Plugin,
  PluginTool,
  CorePluginContext,
} from "@brains/core-plugin";
import { CorePlugin } from "@brains/core-plugin";
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
 * Git Sync plugin that extends CorePlugin
 * Adds git version control to directory-sync
 */
export class GitSyncPlugin extends CorePlugin<GitSyncConfig> {
  private gitSync?: GitSync;

  constructor(config: Partial<GitSyncConfig>) {
    super("git-sync", packageJson, config, gitSyncConfigSchema, {});
  }

  private getGitSync(): GitSync {
    if (!this.gitSync) {
      throw new GitSyncInitializationError("Git sync service not initialized", {
        plugin: "git-sync",
      });
    }
    return this.gitSync;
  }

  /**
   * Initialize the plugin
   */
  protected override async onRegister(
    context: CorePluginContext,
  ): Promise<void> {
    // Register our template for git sync status
    context.registerTemplates({
      status: {
        name: "status",
        description: "Git synchronization status",
        schema: gitSyncStatusSchema,
        basePrompt: "",
        requiredPermission: "public",
        formatter: new GitSyncStatusFormatter(), // Use status formatter for template
      },
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
      ...context,
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
          await this.getGitSync().sync();
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
          await this.getGitSync().commit(commitMessage);
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
          await this.getGitSync().push();
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
          await this.getGitSync().pull();
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
          return this.getGitSync().getStatus();
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
          const gitSync = this.getGitSync();

          if (autoSync) {
            gitSync.startAutoSync();
            return { message: "Auto-sync started" };
          } else {
            gitSync.stopAutoSync();
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
