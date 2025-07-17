import type { Plugin, PluginContext, PluginTool } from "@brains/plugin-utils";
import {
  BasePlugin,
  pluginConfig,
  toolInput,
  PluginInitializationError,
} from "@brains/plugin-utils";
import type { Command, CommandResponse } from "@brains/message-interface";
import { DirectorySyncInitializationError } from "./errors";
import { z } from "zod";
import { DirectorySync } from "./directorySync";
import {
  directorySyncConfigSchema,
  type DirectorySyncConfig,
  type DirectorySyncConfigInput,
} from "./types";
import { DirectorySyncStatusFormatter } from "./formatters/directorySyncStatusFormatter";
import { directorySyncStatusSchema } from "./schemas";
import {
  DirectoryExportJobHandler,
  DirectoryImportJobHandler,
} from "./handlers";
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
export class DirectorySyncPlugin extends BasePlugin<DirectorySyncConfigInput> {
  // After validation with defaults, config is complete
  declare protected config: DirectorySyncConfig;
  private directorySync?: DirectorySync;
  private pluginContext?: PluginContext;

  constructor(config: DirectorySyncConfigInput = {}) {
    super(
      "directory-sync",
      packageJson,
      config,
      directorySyncConfigSchema,
      DIRECTORY_SYNC_CONFIG_DEFAULTS,
    );
  }

  /**
   * Get commands provided by this plugin
   */
  public override async getCommands(): Promise<Command[]> {
    return [
      {
        name: "sync",
        description: "Synchronize all entities with directory",
        usage: "/sync",
        handler: async (_args, context): Promise<CommandResponse> => {
          if (!this.directorySync || !this.pluginContext) {
            throw new DirectorySyncInitializationError(
              "DirectorySync service not initialized",
              "Plugin not properly configured",
              { command: "sync" },
            );
          }

          try {
            // Use DirectorySync service to prepare batch operations
            const batchData = this.directorySync.prepareBatchOperations();

            if (batchData.operations.length === 0) {
              return {
                type: "message",
                message:
                  "✅ **Sync completed** - No operations needed (no entity types or files to sync)",
              };
            }

            const source =
              context.interfaceType && context.channelId
                ? `${context.interfaceType}:${context.channelId}`
                : "command:sync";

            const batchId = await this.pluginContext.enqueueBatch(
              batchData.operations,
              {
                source,
                metadata: {
                  interfaceId: context.interfaceType || "command",
                  userId: context.userId || "command-user",
                  channelId: context.channelId || "",
                  progressToken: context.messageId || "",
                  operationType: "directory_sync",
                  pluginId: this.id,
                },
              },
            );

            return {
              type: "batch-operation",
              message: `🔄 **Sync batch started** - ${batchData.exportOperationsCount} export jobs, ${batchData.importOperationsCount} import jobs for ${batchData.totalFiles} files`,
              batchId,
              operationCount: batchData.operations.length,
            };
          } catch (error) {
            this.error("Sync command failed", error);
            return {
              type: "message",
              message: `❌ **Sync failed**: ${error instanceof Error ? error.message : "Unknown error occurred"}`,
            };
          }
        },
      },
      {
        name: "sync-status",
        description: "Get directory sync status",
        usage: "/sync-status",
        handler: async (_args, _context): Promise<CommandResponse> => {
          if (!this.directorySync) {
            throw new DirectorySyncInitializationError(
              "DirectorySync service not initialized",
              "Plugin not properly configured",
              { command: "sync-status" },
            );
          }

          const status = await this.directorySync.getStatus();
          const { syncPath, exists, watching, lastSync, stats } = status;

          let message = `📊 **Directory Sync Status**\n`;
          message += `📁 Path: \`${syncPath}\`\n`;
          message += `✅ Initialized: ${exists ? "Yes" : "No"}\n`;
          message += `👁️ Watching: ${watching ? "Yes" : "No"}\n`;
          message += `📝 Entity count: ${stats.totalFiles} total`;

          if (Object.keys(stats.byEntityType).length > 0) {
            message += " (";
            const types = Object.entries(stats.byEntityType)
              .map(([type, count]) => `${type}: ${count}`)
              .join(", ");
            message += types + ")";
          }

          if (lastSync) {
            message += `\n🕐 Last sync: ${new Date(lastSync).toLocaleString()}`;
          }

          return {
            type: "message",
            message,
          };
        },
      },
    ];
  }

  /**
   * Initialize the plugin
   */
  protected override async onRegister(context: PluginContext): Promise<void> {
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
    this.registerJobHandlers(context);

    // Register message handlers for plugin communication
    this.registerMessageHandlers(context);
  }

  /**
   * Get the tools provided by this plugin
   */
  protected override async getTools(): Promise<PluginTool[]> {
    if (!this.directorySync) {
      throw new DirectorySyncInitializationError(
        "DirectorySync service not initialized",
        "Plugin not properly configured",
        { method: "getTools" },
      );
    }

    return [
      this.createTool(
        "sync",
        "Synchronize all entities with directory (async)",
        {},
        async (_input: unknown, context): Promise<unknown> => {
          if (!this.directorySync || !this.pluginContext) {
            throw new DirectorySyncInitializationError(
              "DirectorySync service not initialized",
              "Plugin not properly configured",
              { tool: "directory-sync" },
            );
          }

          // Use DirectorySync service to prepare batch operations
          const batchData = this.directorySync.prepareBatchOperations();

          if (batchData.operations.length === 0) {
            return {
              status: "completed",
              message:
                "No operations needed - no entity types or files to sync",
              batchId: `empty-sync-${Date.now()}`,
            };
          }

          const source =
            context?.interfaceId && context.channelId
              ? `${context.interfaceId}:${context.channelId}`
              : "plugin:directory-sync";

          const batchId = await this.pluginContext.enqueueBatch(
            batchData.operations,
            {
              source,
              metadata: {
                interfaceId: context?.interfaceId ?? "",
                userId: context?.userId ?? "",
                channelId: context?.channelId ?? "",
                progressToken: context?.progressToken ?? "",
                operationType: "directory_sync",
                pluginId: this.id,
              },
            },
          );

          return {
            status: "queued",
            message: `Sync batch operation queued: ${batchData.exportOperationsCount} export jobs, ${batchData.importOperationsCount} import jobs for ${batchData.totalFiles} files`,
            batchId,
            exportOperations: batchData.exportOperationsCount,
            importOperations: batchData.importOperationsCount,
            totalFiles: batchData.totalFiles,
            tip: "Use the status tool to check progress of this batch operation",
          };
        },
        "anchor", // Only anchor user can sync
      ),

      this.createTool(
        "export",
        "Export entities to directory (async batch operation)",
        toolInput()
          .custom(
            "entityTypes",
            z
              .array(z.string())
              .optional()
              .describe("Specific entity types to export (optional)"),
          )
          .custom(
            "batchSize",
            z
              .number()
              .min(1)
              .default(100)
              .describe("Number of entities to process per batch"),
          )
          .build(),
        async (input: unknown, context): Promise<unknown> => {
          if (!this.directorySync || !this.pluginContext) {
            throw new DirectorySyncInitializationError(
              "DirectorySync service not initialized",
              "Plugin not properly configured",
              { tool: "directory-sync" },
            );
          }
          const params = input as {
            entityTypes?: string[];
            batchSize?: number;
          };

          // Get entity types to export
          const typesToExport =
            params.entityTypes ??
            this.pluginContext.entityService.getEntityTypes();

          // Create batch operations - one job per entity type
          const operations = typesToExport.map((entityType) => ({
            type: "directory-export",
            entityType,
            options: {
              entityTypes: [entityType],
              batchSize: params.batchSize ?? 100,
            },
          }));

          if (operations.length === 0) {
            return {
              status: "completed",
              message: "No entity types to export",
              batchId: `empty-export-${Date.now()}`,
            };
          }

          const batchId = await this.pluginContext.enqueueBatch(operations, {
            source: "plugin:directory-sync",
            metadata: {
              interfaceId: context?.interfaceId ?? "plugin",
              userId: context?.userId ?? "system",
              channelId: context?.channelId,
              progressToken: context?.progressToken,
              operationType: "directory_export",
              pluginId: this.id,
            },
          });

          return {
            status: "queued",
            message: `Export batch operation queued for ${operations.length} entity types`,
            batchId,
            entityTypes: typesToExport,
            tip: "Use the status tool to check progress of this batch operation",
          };
        },
        "anchor", // Only anchor user can export
      ),

      this.createTool(
        "import",
        "Import entities from directory (async batch operation)",
        toolInput()
          .custom(
            "paths",
            z
              .array(z.string())
              .optional()
              .describe("Specific file paths to import (optional)"),
          )
          .custom(
            "batchSize",
            z
              .number()
              .min(1)
              .default(50)
              .describe("Number of files to process per batch"),
          )
          .build(),
        async (input: unknown, context): Promise<unknown> => {
          if (!this.directorySync || !this.pluginContext) {
            throw new DirectorySyncInitializationError(
              "DirectorySync service not initialized",
              "Plugin not properly configured",
              { tool: "directory-sync" },
            );
          }
          const params = input as { paths?: string[]; batchSize?: number };

          // Get files to import
          const filesToImport =
            params.paths ?? this.directorySync.getAllMarkdownFiles();
          const batchSize = params.batchSize ?? 50;

          // Split files into batches for parallel processing
          const batches: string[][] = [];
          for (let i = 0; i < filesToImport.length; i += batchSize) {
            batches.push(filesToImport.slice(i, i + batchSize));
          }

          if (batches.length === 0) {
            return {
              status: "completed",
              message: "No files to import",
              batchId: `empty-import-${Date.now()}`,
            };
          }

          // Create batch operations - one job per batch of files
          const operations = batches.map((batchPaths, index) => ({
            type: "directory-import",
            batchIndex: index,
            options: {
              paths: batchPaths,
              batchSize: batchPaths.length,
            },
          }));

          const batchId = await this.pluginContext.enqueueBatch(operations, {
            source: "plugin:directory-sync",
            metadata: {
              interfaceId: context?.interfaceId ?? "plugin",
              userId: context?.userId ?? "system",
              channelId: context?.channelId,
              progressToken: context?.progressToken,
              operationType: "directory_import",
              pluginId: this.id,
            },
          });

          return {
            status: "queued",
            message: `Import batch operation queued for ${filesToImport.length} files in ${batches.length} batches`,
            batchId,
            totalFiles: filesToImport.length,
            totalBatches: batches.length,
            tip: "Use the status tool to check progress of this batch operation",
          };
        },
        "anchor", // Only anchor user can import
      ),

      this.createTool(
        "watch",
        "Start or stop directory watching",
        toolInput()
          .enum("action", ["start", "stop"] as const)
          .build(),
        async (input: unknown): Promise<{ watching: boolean }> => {
          if (!this.directorySync) {
            throw new DirectorySyncInitializationError(
              "DirectorySync service not initialized",
              "Plugin not properly configured",
              { tool: "directory-sync" },
            );
          }
          const params = input as { action: "start" | "stop" };

          if (params.action === "start") {
            this.directorySync.startWatching();
          } else {
            this.directorySync.stopWatching();
          }

          const status = await this.directorySync.getStatus();
          return { watching: status.watching };
        },
        "anchor", // Only anchor user can control watching
      ),

      this.createTool(
        "status",
        "Get directory sync status",
        {},
        async (): Promise<unknown> => {
          if (!this.directorySync) {
            throw new DirectorySyncInitializationError(
              "DirectorySync service not initialized",
              "Plugin not properly configured",
              { tool: "directory-sync" },
            );
          }
          const status = await this.directorySync.getStatus();
          // Parse through schema to ensure it has the right structure
          // and the schema description will hint at using directorySyncStatus formatter
          return directorySyncStatusSchema.parse(status);
        },
        "public", // Anyone can check status
      ),

      this.createTool(
        "ensure-structure",
        "Ensure directory structure exists for all entity types",
        {},
        async (): Promise<{ message: string }> => {
          if (!this.directorySync) {
            throw new DirectorySyncInitializationError(
              "DirectorySync service not initialized",
              "Plugin not properly configured",
              { tool: "directory-sync" },
            );
          }
          await this.directorySync.ensureDirectoryStructure();
          return { message: "Directory structure created" };
        },
        "anchor", // Only anchor user can modify structure
      ),
    ];
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
    if (!this.directorySync) {
      throw new DirectorySyncInitializationError(
        "DirectorySync service not initialized",
        "Plugin not properly configured",
        { method: "configure" },
      );
    }

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
  private registerMessageHandlers(context: PluginContext): void {
    const { subscribe } = context;

    // Handler for export requests
    subscribe<{ entityTypes?: string[] }>(
      "entity:export:request",
      async (message) => {
        if (!this.directorySync) {
          return {
            success: false,
            error: "DirectorySync not initialized",
          };
        }

        try {
          const result = await this.directorySync.exportEntities(
            message.payload.entityTypes,
          );

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
        if (!this.directorySync) {
          return {
            success: false,
            error: "DirectorySync not initialized",
          };
        }

        try {
          const result = await this.directorySync.importEntities(
            message.payload.paths,
          );

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
      if (!this.directorySync) {
        return {
          success: false,
          error: "DirectorySync not initialized",
        };
      }

      try {
        const status = await this.directorySync.getStatus();

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
  private registerJobHandlers(context: PluginContext): void {
    if (!this.directorySync) {
      throw new PluginInitializationError(
        this.id,
        "DirectorySync not initialized",
      );
    }

    // Register export job handler
    const exportHandler = new DirectoryExportJobHandler(
      this.logger.child("DirectoryExportJobHandler"),
      context,
      this.directorySync,
    );
    context.registerJobHandler("directory-export", exportHandler);

    // Register import job handler
    const importHandler = new DirectoryImportJobHandler(
      this.logger.child("DirectoryImportJobHandler"),
      context,
      this.directorySync,
    );
    context.registerJobHandler("directory-import", importHandler);

    this.info("Registered async job handlers");
  }
}

/**
 * Configuration builder for directory-sync plugin
 */
export const directorySyncPluginConfig = (): ReturnType<typeof pluginConfig> =>
  pluginConfig()
    .requiredString("syncPath", "Directory path for synchronization")
    .boolean("watchEnabled", false, "Enable file watching")
    .numberWithDefault("watchInterval", 5000, {
      description: "Watch polling interval in milliseconds",
      min: 1000, // 1 second minimum
    })
    .boolean("includeMetadata", true, "Include frontmatter metadata")
    .array("entityTypes", z.string(), {
      description: "Specific entity types to sync",
      default: [],
    })
    .describe("Configuration for the directory-sync plugin");

/**
 * Factory function for creating directory sync plugin
 */
export function directorySync(config: DirectorySyncConfigInput): Plugin {
  return new DirectorySyncPlugin(config);
}
