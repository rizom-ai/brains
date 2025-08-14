import type { Plugin, ServicePluginContext, Command } from "@brains/plugins";
import { ServicePlugin } from "@brains/plugins";
import { DirectorySync } from "./lib/directory-sync";
import { directorySyncConfigSchema, type DirectorySyncConfig } from "./types";
import { DirectorySyncStatusFormatter } from "./formatters/directorySyncStatusFormatter";
import { directorySyncStatusSchema } from "./schemas";
import {
  DirectoryExportJobHandler,
  DirectoryImportJobHandler,
} from "./handlers";
import { createDirectorySyncTools } from "./tools";
import { createDirectorySyncCommands } from "./commands";
import "./types/job-augmentation";
import packageJson from "../package.json";

const DIRECTORY_SYNC_CONFIG_DEFAULTS = {
  syncPath: "./brain-data",
  watchEnabled: false,
  watchInterval: 1000,
  includeMetadata: true,
} as const;

/**
 * Directory Sync plugin that extends BasePlugin
 * Synchronizes brain entities with a directory structure
 */
export class DirectorySyncPlugin extends ServicePlugin<DirectorySyncConfig> {
  private directorySync?: DirectorySync;
  private pluginContext?: ServicePluginContext;

  constructor(config: Partial<DirectorySyncConfig> = {}) {
    super(
      "directory-sync",
      packageJson,
      config,
      directorySyncConfigSchema,
      DIRECTORY_SYNC_CONFIG_DEFAULTS,
    );
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

    // Initialize directory
    try {
      await this.directorySync.initialize();
      this.info("Directory sync initialized successfully", {
        path: this.config.syncPath,
      });
    } catch (error) {
      this.error("Failed to initialize directory sync", error);
      throw error; // Fail plugin registration if init fails
    }

    // Register job handlers for async operations
    await this.registerJobHandlers(context);

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
   * Register job handlers for async operations
   */
  protected override async registerJobHandlers(
    context: ServicePluginContext,
  ): Promise<void> {
    const directorySync = this.requireDirectorySync();

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
