import type { Plugin, PluginTool, CorePluginContext } from "@brains/plugins";
import { CorePlugin } from "@brains/plugins";
import { GitSync } from "./lib/git-sync";
import { gitSyncConfigSchema, type GitSyncConfig } from "./types";
import { GitSyncStatusFormatter } from "./formatters/git-sync-status-formatter";
import { gitSyncStatusSchema } from "./schemas";
import { createGitSyncTools } from "./tools";
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

    // Signal that git-sync is installed - directory-sync uses this to know
    // it should wait for git:pull:completed before starting its sync
    await context.sendMessage(
      "git:sync:registered",
      { pluginId: this.id },
      { broadcast: true },
    );

    // Pull from remote when plugins are ready, BEFORE directory-sync runs
    // This ensures remote data is available before directory-sync imports to DB
    context.subscribe("system:plugins:ready", async () => {
      this.logger.debug(
        "Plugins ready, pulling from remote before directory-sync",
      );

      const git = this.getGitSync();
      const status = await git.getStatus();

      // Only pull if we have a remote
      if (status.remote) {
        try {
          await git.pull();
          this.logger.info("Pulled from remote, ready for directory-sync");
        } catch (error) {
          this.logger.warn("Failed to pull during startup", { error });
        }
      }

      // Emit event so directory-sync knows it can proceed
      // This event is emitted even if there's no remote, so directory-sync
      // can proceed in standalone mode
      await context.sendMessage(
        "git:pull:completed",
        { success: true, hasRemote: !!status.remote },
        { broadcast: true },
      );

      return { success: true };
    });

    // Commit and push after directory-sync completes its initial import
    // This ensures any imported entities are committed to git
    context.subscribe("sync:initial:completed", async () => {
      this.logger.debug(
        "Initial sync completed by directory-sync, committing and pushing",
      );

      const git = this.getGitSync();
      try {
        // Just commit and push - don't pull again (already done above)
        const status = await git.getStatus();
        if (status.hasChanges) {
          await git.commit();
          this.logger.info("Committed changes after initial sync");
        }
        if (status.remote && status.ahead > 0) {
          await git.push();
          this.logger.info("Pushed changes after initial sync");
        }
      } catch (error) {
        this.logger.warn("Failed to commit/push after initial sync", { error });
      }

      return { success: true };
    });
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
