import type {
  Plugin,
  PluginTool,
  Command,
  CorePluginContext,
} from "@brains/plugins";
import { CorePlugin } from "@brains/plugins";
import { GitSync } from "./lib/git-sync";
import { gitSyncConfigSchema, type GitSyncConfig } from "./types";
import { GitSyncStatusFormatter } from "./formatters/git-sync-status-formatter";
import { gitSyncStatusSchema } from "./schemas";
import { createGitSyncTools } from "./tools";
import { createGitSyncCommands } from "./commands";
import packageJson from "../package.json";

/**
 * Git Sync plugin that extends CorePlugin
 * Adds git version control to directory-sync
 */

export class GitSyncPlugin extends CorePlugin<GitSyncConfig> {
  private gitSync?: GitSync;

  constructor(config: Partial<GitSyncConfig>) {
    super("git-sync", packageJson, config, gitSyncConfigSchema);
  }

  private getGitSync(): GitSync {
    if (!this.gitSync) {
      throw new Error("Git sync service not initialized");
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
      autoPush: this.config.autoPush,
      ...context,
    });

    // Initialize repository
    await this.gitSync.initialize();

    // Sync after all plugins are initialized
    // This ensures any seed content created by plugins (like site-info, profile)
    // gets committed to git, even if created after the sync:initial:completed handler
    context.subscribe("system:plugins:ready", async () => {
      this.logger.debug(
        "All plugins initialized, performing final sync to commit any seed content",
      );

      const git = this.getGitSync();
      const status = await git.getStatus();

      // Only sync if we have a remote
      if (status.remote) {
        try {
          await git.sync();
          this.logger.info(
            "Successfully synced after plugin initialization (seed content committed)",
          );
        } catch (error) {
          this.logger.warn("Failed to sync during post-init", { error });
        }
      }

      return { success: true };
    });

    // Listen for directory-sync initial sync completion
    // When directory-sync exports entities on startup, commit and push them
    context.subscribe("sync:initial:completed", async () => {
      this.logger.debug(
        "Initial sync completed by directory-sync, syncing git",
      );

      const git = this.getGitSync();
      try {
        await git.sync();
        this.logger.info("Synced git after initial directory sync");
      } catch (error) {
        this.logger.warn("Failed to sync git after initial sync", { error });
      }

      return { success: true };
    });
  }

  /**
   * Define the commands provided by this plugin
   */
  override async getCommands(): Promise<Command[]> {
    return createGitSyncCommands(this.getGitSync());
  }

  /**
   * Define the tools provided by this plugin
   */
  override async getTools(): Promise<PluginTool[]> {
    return createGitSyncTools(this.getGitSync(), this.id);
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
export function gitSync(config: Partial<GitSyncConfig>): Plugin {
  return new GitSyncPlugin(config);
}
