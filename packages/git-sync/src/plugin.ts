import type {
  Plugin,
  PluginContext,
  EntityService,
  BrainProtocol,
} from "@brains/types";
import { GitSync } from "./gitSync";
import { gitSyncConfigSchema, type GitSyncConfig, type GitSyncConfigInput } from "./types";

export class GitSyncPlugin implements Plugin {
  id = "git-sync";
  name = "Git Sync";
  version = "1.0.0";
  description = "Synchronize brain data with a git repository";

  private gitSync: GitSync | null = null;
  private config: GitSyncConfig;

  constructor(config: GitSyncConfigInput) {
    // Validate config with Zod
    this.config = gitSyncConfigSchema.parse(config);
  }

  register(context: PluginContext): void {
    const { logger, registry } = context;

    // Get required services from registry
    const entityService = registry.resolve<EntityService>("entityService");
    const brainProtocol = registry.resolve<BrainProtocol>("brainProtocol");

    // These are required services - registry.resolve will throw if not found

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

    // Initialize git repository (synchronously, as register is not async)
    void this.gitSync.initialize().catch((error) => {
      logger.error("Failed to initialize git repository", error);
    });

    // Register commands with BrainProtocol
    brainProtocol.registerCommandHandler("sync", async (cmd) => {
      if (!this.gitSync) {
        throw new Error("GitSync not initialized");
      }
      await this.gitSync.sync();
      return {
        id: `response-${Date.now()}`,
        commandId: cmd.id,
        success: true,
        result: { message: "Sync completed" },
      };
    });

    brainProtocol.registerCommandHandler("sync:pull", async (cmd) => {
      if (!this.gitSync) {
        throw new Error("GitSync not initialized");
      }
      await this.gitSync.importFromGit();
      return {
        id: `response-${Date.now()}`,
        commandId: cmd.id,
        success: true,
        result: { message: "Pull completed" },
      };
    });

    brainProtocol.registerCommandHandler("sync:push", async (cmd) => {
      if (!this.gitSync) {
        throw new Error("GitSync not initialized");
      }
      await this.gitSync.exportToGit();
      return {
        id: `response-${Date.now()}`,
        commandId: cmd.id,
        success: true,
        result: { message: "Push completed" },
      };
    });

    brainProtocol.registerCommandHandler("sync:status", async (cmd) => {
      if (!this.gitSync) {
        throw new Error("GitSync not initialized");
      }
      const status = await this.gitSync.getStatus();
      return {
        id: `response-${Date.now()}`,
        commandId: cmd.id,
        success: true,
        result: status,
      };
    });

    // Register MCP tools
    // TODO: Implement actual MCP tool registration using mcpServer.tool() or similar API
    // For now, we have access to mcpServer for future tool registration

    logger.info("Git sync plugin registered", {
      commands: ["sync", "sync:pull", "sync:push", "sync:status"],
    });

    // Start auto-sync if configured
    if (this.config.autoSync) {
      this.gitSync.startAutoSync().catch((error) => {
        logger.error("Failed to start auto-sync", error);
      });
    }

    logger.info("Git sync plugin registered");
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
