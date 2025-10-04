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

    // Pull initial content after all plugins are initialized
    // This ensures entity types are registered before importing files
    context.subscribe("system:plugins:ready", async () => {
      this.logger.debug("All plugins initialized, performing initial git pull");

      const git = this.getGitSync();
      const status = await git.getStatus();

      // Only pull if we have a remote
      if (status.remote) {
        try {
          const remoteBranchExists = await git.pull();
          if (remoteBranchExists) {
            this.logger.info(
              "Successfully pulled and imported initial content",
            );
          } else {
            this.logger.info(
              "Remote branch doesn't exist yet, will create on first push",
            );

            // If we have commits and autoPush is enabled, push to create the branch
            if (status.lastCommit && this.config.autoPush) {
              try {
                await git.push();
                this.logger.info(
                  "Pushed initial commits to create remote branch",
                );
              } catch (pushError) {
                this.logger.warn("Failed to push initial commits", {
                  pushError,
                });
              }
            }
          }
        } catch (error) {
          this.logger.warn("Failed to pull during post-init", { error });
        }
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
