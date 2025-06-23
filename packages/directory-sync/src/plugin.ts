import type {
  Plugin,
  PluginContext,
  PluginTool,
  MessageBus,
} from "@brains/types";
import {
  BasePlugin,
  pluginConfig,
  validatePluginConfig,
  toolInput,
} from "@brains/utils";
import { z } from "zod";
import { DirectorySync } from "./directorySync";
import {
  directorySyncConfigSchema,
  type DirectorySyncConfig,
  type DirectorySyncConfigInput,
} from "./types";
import { DirectorySyncStatusFormatter } from "./formatters/directorySyncStatusFormatter";
import { GenericYamlFormatter } from "@brains/shell";
import {
  directorySyncStatusSchema,
  exportResultSchema,
  importResultSchema,
  syncResultSchema,
} from "./schemas";

/**
 * Directory Sync plugin that extends BasePlugin
 * Synchronizes brain entities with a directory structure
 */
export class DirectorySyncPlugin extends BasePlugin<DirectorySyncConfig> {
  private directorySync?: DirectorySync;

  constructor(config: unknown) {
    // Validate config first
    const validatedConfig = validatePluginConfig(
      directorySyncConfigSchema,
      config,
      "directory-sync",
    );

    super(
      "directory-sync",
      "Directory Sync",
      "Synchronize brain entities with a directory structure",
      validatedConfig,
    );
  }

  /**
   * Initialize the plugin
   */
  protected override async onRegister(context: PluginContext): Promise<void> {
    const { logger, entityService, contentRegistry, messageBus } = context;

    // Register our custom formatter with content registry
    contentRegistry.registerContent("directory-sync:status", {
      template: {
        name: "directorySyncStatus",
        description: "Directory synchronization status",
        schema: directorySyncStatusSchema,
        basePrompt: "",
        formatter: new GenericYamlFormatter(), // Use YAML formatter for template
      },
      formatter: new DirectorySyncStatusFormatter(), // Response formatter
      schema: directorySyncStatusSchema,
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

    // Register message handlers for plugin communication
    this.registerMessageHandlers(messageBus);
  }

  /**
   * Get the tools provided by this plugin
   */
  protected override async getTools(): Promise<PluginTool[]> {
    if (!this.directorySync) {
      throw new Error("DirectorySync not initialized");
    }

    return [
      this.createTool(
        "sync",
        "Synchronize all entities with directory",
        {},
        async (): Promise<unknown> => {
          if (!this.directorySync) {
            throw new Error("DirectorySync not initialized");
          }
          const result = await this.directorySync.sync();
          return syncResultSchema.parse(result);
        },
        "anchor", // Only anchor user can sync
      ),

      this.createTool(
        "export",
        "Export entities to directory",
        toolInput()
          .custom(
            "entityTypes",
            z
              .array(z.string())
              .optional()
              .describe("Specific entity types to export (optional)"),
          )
          .build(),
        async (input: unknown): Promise<unknown> => {
          if (!this.directorySync) {
            throw new Error("DirectorySync not initialized");
          }
          const params = input as { entityTypes?: string[] };
          const result = await this.directorySync.exportEntities(
            params.entityTypes,
          );
          return exportResultSchema.parse(result);
        },
        "anchor", // Only anchor user can export
      ),

      this.createTool(
        "import",
        "Import entities from directory",
        toolInput()
          .custom(
            "paths",
            z
              .array(z.string())
              .optional()
              .describe("Specific file paths to import (optional)"),
          )
          .build(),
        async (input: unknown): Promise<unknown> => {
          if (!this.directorySync) {
            throw new Error("DirectorySync not initialized");
          }
          const params = input as { paths?: string[] };
          const result = await this.directorySync.importEntities(params.paths);
          return importResultSchema.parse(result);
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
            throw new Error("DirectorySync not initialized");
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
            throw new Error("DirectorySync not initialized");
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
            throw new Error("DirectorySync not initialized");
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
      throw new Error("DirectorySync not initialized");
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
  private registerMessageHandlers(messageBus: MessageBus): void {
    // Handler for export requests
    messageBus.subscribe("entity:export:request", async (message) => {
      if (!this.directorySync) {
        return {
          success: false,
          error: "DirectorySync not initialized",
        };
      }

      try {
        const payload = message.payload as { entityTypes?: string[] };
        const result = await this.directorySync.exportEntities(
          payload.entityTypes,
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
    });

    // Handler for import requests
    messageBus.subscribe("entity:import:request", async (message) => {
      if (!this.directorySync) {
        return {
          success: false,
          error: "DirectorySync not initialized",
        };
      }

      try {
        const payload = message.payload as { paths?: string[] };
        const result = await this.directorySync.importEntities(payload.paths);

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
    });

    // Handler for status requests
    messageBus.subscribe("sync:status:request", async () => {
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
    messageBus.subscribe("sync:configure:request", async (message) => {
      if (!this.directorySync) {
        return {
          success: false,
          error: "DirectorySync not initialized",
        };
      }

      try {
        const payload = message.payload as { syncPath: string };

        // Reconfigure directory sync with new path
        await this.configure({ syncPath: payload.syncPath });

        return {
          success: true,
          data: {
            syncPath: payload.syncPath,
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
    });

    this.info("Registered message handlers for inter-plugin communication");
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
