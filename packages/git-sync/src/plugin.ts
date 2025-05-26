import type {
  Plugin,
  PluginContext,
  PluginCapabilities,
  PluginTool,
  EntityService,
  BrainProtocol,
} from "@brains/types";
import { GitSync } from "./gitSync";
import {
  gitSyncConfigSchema,
  type GitSyncConfig,
  type GitSyncConfigInput,
} from "./types";

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

  register(context: PluginContext): PluginCapabilities {
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
          return this.gitSync.getStatus();
        },
      },
    ];

    // Also register commands with BrainProtocol for backward compatibility
    const [syncTool, pullTool, pushTool, statusTool] = tools;
    
    if (syncTool) {
      brainProtocol.registerCommandHandler("sync", async (cmd) => {
        const result = await syncTool.handler({});
        return {
          id: `response-${Date.now()}`,
          commandId: cmd.id,
          success: true,
          result,
        };
      });
    }

    if (pullTool) {
      brainProtocol.registerCommandHandler("sync:pull", async (cmd) => {
        const result = await pullTool.handler({});
        return {
          id: `response-${Date.now()}`,
          commandId: cmd.id,
          success: true,
          result,
        };
      });
    }

    if (pushTool) {
      brainProtocol.registerCommandHandler("sync:push", async (cmd) => {
        const result = await pushTool.handler({});
        return {
          id: `response-${Date.now()}`,
          commandId: cmd.id,
          success: true,
          result,
        };
      });
    }

    if (statusTool) {
      brainProtocol.registerCommandHandler("sync:status", async (cmd) => {
        const result = await statusTool.handler({});
        return {
          id: `response-${Date.now()}`,
          commandId: cmd.id,
          success: true,
          result,
        };
      });
    }

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
