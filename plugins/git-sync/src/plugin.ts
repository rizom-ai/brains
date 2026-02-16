import type { Plugin, PluginTool, ServicePluginContext } from "@brains/plugins";
import { ServicePlugin } from "@brains/plugins";
import { GitSync } from "./lib/git-sync";
import { gitSyncConfigSchema, type GitSyncConfig } from "./types";
import { GitSyncStatusFormatter } from "./formatters/git-sync-status-formatter";
import { gitSyncStatusSchema } from "./schemas";
import { createGitSyncTools } from "./tools";
import { SyncJobHandler } from "./handlers/sync-handler";
import packageJson from "../package.json";

/**
 * Git Sync plugin that extends ServicePlugin
 * Adds git version control to directory-sync
 */

export class GitSyncPlugin extends ServicePlugin<GitSyncConfig> {
  private gitSync?: GitSync;
  private commitTimeout?: Timer;
  private syncing = false;

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
    context: ServicePluginContext,
  ): Promise<void> {
    // Register our template for git sync status
    context.templates.register({
      status: {
        name: "status",
        description: "Git synchronization status",
        schema: gitSyncStatusSchema,
        basePrompt: "",
        requiredPermission: "public",
        formatter: new GitSyncStatusFormatter(),
      },
    });

    // Create GitSync instance
    this.gitSync = new GitSync({
      ...(this.config.repo && { repo: this.config.repo }),
      ...(this.config.gitUrl && { gitUrl: this.config.gitUrl }),
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

    // Register sync job handler
    context.jobs.registerHandler(
      "sync",
      new SyncJobHandler(this.logger.child("SyncJobHandler"), this.gitSync),
    );

    // Signal that git-sync is installed - directory-sync uses this to know
    // it should wait for git:pull:completed before starting its sync
    await context.messaging.send(
      "git:sync:registered",
      { pluginId: this.id },
      { broadcast: true },
    );

    // Respond to repo info requests (used by site-builder for CMS config)
    context.messaging.subscribe("git-sync:get-repo-info", async () => {
      return {
        success: true,
        data: {
          repo: this.config.repo,
          branch: this.config.branch,
        },
      };
    });

    // Pull from remote when plugins are ready, BEFORE directory-sync runs
    context.messaging.subscribe("system:plugins:ready", async () => {
      this.logger.debug(
        "Plugins ready, pulling from remote before directory-sync",
      );

      const git = this.getGitSync();
      const hasRemote = git.hasRemote();

      if (hasRemote) {
        try {
          await git.pull();
          this.logger.info("Pulled from remote, ready for directory-sync");
        } catch (error) {
          this.logger.warn("Failed to pull during startup", { error });
        }
      }

      await context.messaging.send(
        "git:pull:completed",
        { success: true, hasRemote },
        { broadcast: true },
      );

      return { success: true };
    });

    // Commit and push after directory-sync completes its initial import
    context.messaging.subscribe("sync:initial:completed", async () => {
      this.logger.debug(
        "Initial sync completed by directory-sync, committing and pushing",
      );

      const git = this.getGitSync();
      try {
        const status = await git.getStatus();
        if (status.hasChanges) {
          await git.commit();
          this.logger.info("Committed changes after initial sync");
        }
        if (git.hasRemote() && status.ahead > 0) {
          await git.push();
          this.logger.info("Pushed changes after initial sync");
        }
      } catch (error) {
        this.logger.warn("Failed to commit/push after initial sync", { error });
      }

      return { success: true };
    });

    // Debounced commit+push on entity changes
    const debouncedCommitAndPush = (): void => {
      if (this.commitTimeout) clearTimeout(this.commitTimeout);
      this.commitTimeout = setTimeout((): void => {
        void (async (): Promise<void> => {
          if (this.syncing) return;
          this.syncing = true;
          try {
            const git = this.getGitSync();
            const status = await git.getStatus();
            if (status.hasChanges) {
              await git.commit();
              this.logger.info("Auto-committed entity changes");

              // We just committed, push if remote exists
              if (git.hasRemote()) {
                await git.push();
                this.logger.info("Auto-pushed entity changes");
              }
            }
          } catch (error) {
            this.logger.warn("Failed to auto-commit/push", { error });
          } finally {
            this.syncing = false;
          }
        })();
      }, this.config.commitDebounce);
    };

    context.messaging.subscribe("entity:created", async () => {
      debouncedCommitAndPush();
      return { success: true };
    });

    context.messaging.subscribe("entity:updated", async () => {
      debouncedCommitAndPush();
      return { success: true };
    });

    context.messaging.subscribe("entity:deleted", async () => {
      debouncedCommitAndPush();
      return { success: true };
    });
  }

  /**
   * Define the tools provided by this plugin
   */
  override async getTools(): Promise<PluginTool[]> {
    if (!this.context) throw new Error("Plugin context not available");
    return createGitSyncTools(this.getGitSync(), this.id, this.context);
  }

  /**
   * Cleanup when plugin is unregistered
   */
  protected async onUnregister(): Promise<void> {
    if (this.commitTimeout) {
      clearTimeout(this.commitTimeout);
    }
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
