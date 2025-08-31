import type { Plugin, ServicePluginContext, Command } from "@brains/plugins";
import { ServicePlugin, createId } from "@brains/plugins";
import { DirectorySync } from "./lib/directory-sync";
import {
  directorySyncConfigSchema,
  type DirectorySyncConfig,
  type JobRequest,
} from "./types";
import { DirectorySyncStatusFormatter } from "./formatters/directorySyncStatusFormatter";
import { directorySyncStatusSchema } from "./schemas";
import {
  DirectoryExportJobHandler,
  DirectoryImportJobHandler,
  DirectorySyncJobHandler,
} from "./handlers";
import { createDirectorySyncTools } from "./tools";
import { createDirectorySyncCommands } from "./commands";
import "./types/job-augmentation";
import packageJson from "../package.json";

/**
 * Directory Sync plugin that extends BasePlugin
 * Synchronizes brain entities with a directory structure
 */
export class DirectorySyncPlugin extends ServicePlugin<DirectorySyncConfig> {
  private directorySync?: DirectorySync;
  private pluginContext?: ServicePluginContext;

  constructor(config: Partial<DirectorySyncConfig> = {}) {
    super("directory-sync", packageJson, config, directorySyncConfigSchema);
  }

  private requireDirectorySync(): DirectorySync {
    if (!this.directorySync) {
      throw new Error("DirectorySync service not initialized");
    }
    return this.directorySync;
  }

  private requirePluginContext(): ServicePluginContext {
    if (!this.pluginContext) {
      throw new Error("Plugin context not initialized");
    }
    return this.pluginContext;
  }

  /**
   * Get commands provided by this plugin
   */
  public override async getCommands(): Promise<Command[]> {
    const directorySync = this.requireDirectorySync();
    const pluginContext = this.requirePluginContext();
    return createDirectorySyncCommands(directorySync, pluginContext, this.id);
  }

  /**
   * Initialize the plugin
   */
  protected override async onRegister(
    context: ServicePluginContext,
  ): Promise<void> {
    this.pluginContext = context;
    const { logger, entityService } = context;

    // Register our template for directory sync status
    context.registerTemplates({
      status: {
        name: "status",
        description: "Directory synchronization status",
        schema: directorySyncStatusSchema,
        basePrompt: "",
        formatter: new DirectorySyncStatusFormatter(), // Use status formatter for template
        requiredPermission: "anchor",
      },
    });

    // Create DirectorySync instance
    this.directorySync = new DirectorySync({
      syncPath: this.config.syncPath,
      watchEnabled: this.config.watchEnabled,
      watchInterval: this.config.watchInterval,
      includeMetadata: this.config.includeMetadata,
      entityTypes: this.config.entityTypes,
      entityService,
      logger,
    });

    // Initialize directory structure only (no sync)
    try {
      await this.directorySync.initializeDirectory();
      this.info("Directory structure initialized", {
        path: this.config.syncPath,
      });
    } catch (error) {
      this.error("Failed to initialize directory", error);
      throw error; // Fail plugin registration if init fails
    }

    // Register job handlers for async operations
    await this.registerJobHandlers(context);

    // Setup file watcher with job queue integration if enabled
    if (this.config.watchEnabled) {
      this.setupFileWatcher(context);
      await this.directorySync.startWatching();
    }

    // Queue initial sync job if enabled
    if (this.config.initialSync) {
      setTimeout(async () => {
        const jobId = await this.queueSyncJob(context, "initial");
        this.info("Queued initial sync job", {
          jobId,
          delay: this.config.initialSyncDelay,
        });
      }, this.config.initialSyncDelay || 1000);
    }

    // Register message handlers for plugin communication
    this.registerMessageHandlers(context);
  }

  /**
   * Get the tools provided by this plugin
   */
  protected override async getTools() {
    const directorySync = this.requireDirectorySync();
    const pluginContext = this.requirePluginContext();
    return createDirectorySyncTools(directorySync, pluginContext, this.id);
  }

  /**
   * Shutdown the plugin
   */
  protected override async onShutdown(): Promise<void> {
    this.directorySync?.stopWatching();
  }

  /**
   * Get the DirectorySync instance (for other plugins to use)
   */
  public getDirectorySync(): DirectorySync | undefined {
    return this.directorySync;
  }

  /**
   * Configure the sync path (for other plugins to use)
   */
  public async configure(options: { syncPath: string }): Promise<void> {
    this.requireDirectorySync(); // Verify it's initialized

    // Update the sync path
    const context = this.getContext();
    this.directorySync = new DirectorySync({
      ...this.config,
      syncPath: options.syncPath,
      entityService: context.entityService,
      logger: context.logger,
    });

    await this.directorySync.initialize();
    this.info("Directory sync reconfigured", { path: options.syncPath });
  }

  /**
   * Register message handlers for inter-plugin communication
   */
  private registerMessageHandlers(context: ServicePluginContext): void {
    const { subscribe } = context;

    // Handler for export requests
    subscribe<{ entityTypes?: string[] }>(
      "entity:export:request",
      async (message) => {
        try {
          const ds = this.requireDirectorySync();
          const result = await ds.exportEntities(message.payload.entityTypes);

          return {
            success: true,
            data: result,
          };
        } catch (error) {
          return {
            success: false,
            error: error instanceof Error ? error.message : "Export failed",
          };
        }
      },
    );

    // Handler for import requests
    subscribe<{ paths?: string[] }>(
      "entity:import:request",
      async (message) => {
        try {
          const ds = this.requireDirectorySync();
          const result = await ds.importEntities(message.payload.paths);

          return {
            success: true,
            data: result,
          };
        } catch (error) {
          return {
            success: false,
            error: error instanceof Error ? error.message : "Import failed",
          };
        }
      },
    );

    // Handler for status requests
    subscribe("sync:status:request", async () => {
      try {
        const ds = this.requireDirectorySync();
        const status = await ds.getStatus();

        return {
          success: true,
          data: {
            syncPath: status.syncPath,
            isInitialized: status.exists,
            watchEnabled: status.watching,
          },
        };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : "Status check failed",
        };
      }
    });

    // Handler for configuration requests
    subscribe<{ syncPath: string }>(
      "sync:configure:request",
      async (message) => {
        if (!this.directorySync) {
          return {
            success: false,
            error: "DirectorySync not initialized",
          };
        }

        try {
          // Reconfigure directory sync with new path
          await this.configure({ syncPath: message.payload.syncPath });

          return {
            success: true,
            data: {
              syncPath: message.payload.syncPath,
              configured: true,
            },
          };
        } catch (error) {
          return {
            success: false,
            error:
              error instanceof Error ? error.message : "Configuration failed",
          };
        }
      },
    );

    this.info("Registered message handlers for inter-plugin communication");
  }

  /**
   * Queue a sync job as a batch for progress visibility
   */
  private async queueSyncJob(
    context: ServicePluginContext,
    operation: "initial" | "scheduled" | "manual",
  ): Promise<string> {
    const directorySync = this.requireDirectorySync();
    const result = await directorySync.queueSyncBatch(
      context,
      `directory-sync-${operation}`,
      {
        pluginId: this.id,
      },
    );

    if (!result) {
      this.info("No sync operations needed", { operation });
      return `empty-sync-${Date.now()}`;
    }

    return result.batchId;
  }

  /**
   * Setup file watcher with job queue integration
   */
  private setupFileWatcher(context: ServicePluginContext): void {
    const directorySync = this.requireDirectorySync();
    directorySync.setJobQueueCallback(async (job: JobRequest) => {
      // Use enqueueBatch for all file watcher operations to ensure progress visibility
      const operations = [
        {
          type: job.type,
          data: job.data as Record<string, unknown>,
        },
      ];

      return context.enqueueBatch(operations, {
        priority: 5,
        source: "directory-sync-watcher",
        metadata: {
          rootJobId: createId(),
          operationType: "file_operations",
          operationTarget: this.config.syncPath,
          pluginId: "directory-sync",
        },
      });
    });
  }

  /**
   * Register job handlers for async operations
   */
  protected override async registerJobHandlers(
    context: ServicePluginContext,
  ): Promise<void> {
    const directorySync = this.requireDirectorySync();

    // Register sync job handler
    const syncHandler = new DirectorySyncJobHandler(
      this.logger.child("DirectorySyncJobHandler"),
      context,
      directorySync,
    );
    context.registerJobHandler("directory-sync", syncHandler);

    // Register export job handler
    const exportHandler = new DirectoryExportJobHandler(
      this.logger.child("DirectoryExportJobHandler"),
      context,
      directorySync,
    );
    context.registerJobHandler("directory-export", exportHandler);

    // Register import job handler
    const importHandler = new DirectoryImportJobHandler(
      this.logger.child("DirectoryImportJobHandler"),
      context,
      directorySync,
    );
    context.registerJobHandler("directory-import", importHandler);

    this.info("Registered async job handlers");
  }
}

/**
 * Factory function for creating directory sync plugin
 */
export function directorySync(
  config: Partial<DirectorySyncConfig> = {},
): Plugin {
  return new DirectorySyncPlugin(config);
}
