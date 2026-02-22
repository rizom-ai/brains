import type {
  Plugin,
  ServicePluginContext,
  PluginTool,
  BaseEntity,
} from "@brains/plugins";
import { ServicePlugin, createId } from "@brains/plugins";
import type { Logger } from "@brains/utils";
import { DirectorySync } from "./lib/directory-sync";
import { existsSync, readdirSync, mkdirSync, copyFileSync } from "fs";
import { execSync } from "child_process";
import { join, resolve } from "path";
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
  DirectoryDeleteJobHandler,
  CoverImageConversionJobHandler,
  InlineImageConversionJobHandler,
} from "./handlers";
import { createDirectorySyncTools } from "./tools";
import "./types/job-augmentation";
import packageJson from "../package.json";

export class DirectorySyncPlugin extends ServicePlugin<DirectorySyncConfig> {
  private directorySync?: DirectorySync;

  constructor(config: Partial<DirectorySyncConfig> = {}) {
    super("directory-sync", packageJson, config, directorySyncConfigSchema);
  }

  private requireDirectorySync(): DirectorySync {
    if (!this.directorySync) {
      throw new Error("DirectorySync service not initialized");
    }
    return this.directorySync;
  }

  protected override async onRegister(
    context: ServicePluginContext,
  ): Promise<void> {
    const { logger, entityService } = context;

    context.templates.register({
      status: {
        name: "status",
        description: "Directory synchronization status",
        schema: directorySyncStatusSchema,
        basePrompt: "",
        formatter: new DirectorySyncStatusFormatter(),
        requiredPermission: "anchor",
      },
    });

    const syncPath = this.config.syncPath ?? context.dataDir;
    this.directorySync = new DirectorySync({
      syncPath,
      autoSync: this.config.autoSync,
      watchInterval: this.config.watchInterval,
      includeMetadata: this.config.includeMetadata,
      entityTypes: this.config.entityTypes,
      deleteOnFileRemoval: this.config.deleteOnFileRemoval,
      entityService,
      logger,
    });

    try {
      await this.directorySync.initializeDirectory();
      this.logger.debug("Directory structure initialized", {
        path: syncPath,
      });
    } catch (error) {
      this.logger.error("Failed to initialize directory", error);
      throw error;
    }

    await this.registerJobHandlers(context);

    if (this.config.autoSync) {
      this.setupAutoSync(context);
      this.setupFileWatcher(context);
    }

    if (this.config.initialSync) {
      let initialSyncStarted = false;
      let gitSyncEnabled = false;

      const runInitialSync = async (): Promise<void> => {
        if (initialSyncStarted) return;
        initialSyncStarted = true;

        if (this.config.seedContent) {
          await this.copySeedContentIfNeeded(syncPath);
        }

        await this.queueSyncJob(context, "initial");

        // Full bidirectional sync ensures seed content is loaded into DB
        try {
          const directorySync = this.requireDirectorySync();
          this.logger.debug("Starting initial bidirectional sync");
          const syncResult = await directorySync.sync();
          this.logger.debug("Initial sync completed", {
            imported: syncResult.import.imported,
            jobCount: syncResult.import.jobIds.length,
          });

          if (syncResult.import.jobIds.length > 0) {
            this.logger.debug(
              "Waiting for embedding generation to complete for imported entities",
            );
            await this.waitForJobs(
              context,
              syncResult.import.jobIds,
              "embedding",
            );
            this.logger.debug("All embedding jobs completed");
          }

          await context.messaging.send(
            "sync:initial:completed",
            { success: true },
            { broadcast: true },
          );
        } catch (error) {
          this.logger.error("Initial sync failed", error);
          await context.messaging.send(
            "sync:initial:completed",
            {
              success: false,
              error: error instanceof Error ? error.message : String(error),
            },
            { broadcast: true },
          );
        }
      };

      context.messaging.subscribe("git:sync:registered", async () => {
        this.logger.debug(
          "git:sync:registered received, will wait for git:pull:completed",
        );
        gitSyncEnabled = true;
        return { success: true };
      });

      context.messaging.subscribe("git:pull:completed", async () => {
        this.logger.debug("git:pull:completed received, starting initial sync");
        await runInitialSync();
        return { success: true };
      });

      context.messaging.subscribe("system:plugins:ready", async () => {
        if (gitSyncEnabled) {
          this.logger.debug(
            "system:plugins:ready received, but git-sync is enabled - waiting for git:pull:completed",
          );
        } else {
          this.logger.debug(
            "system:plugins:ready received, no git-sync - starting initial sync immediately",
          );
          await runInitialSync();
        }
        return { success: true };
      });
    }

    this.registerMessageHandlers(context);
  }

  private async copySeedContentIfNeeded(dataDir: string): Promise<void> {
    const brainDataPath = resolve(process.cwd(), dataDir);
    const seedContentPath = resolve(process.cwd(), "seed-content");

    const isEmpty = this.isBrainDataEmpty(brainDataPath);

    if (isEmpty && existsSync(seedContentPath)) {
      this.logger.debug("Copying seed content to brain-data directory");
      await this.copyDirectory(seedContentPath, brainDataPath);
      this.logger.debug("Seed content copied successfully");
    } else if (isEmpty) {
      this.logger.debug(
        "No seed content directory found, starting with empty brain-data",
      );
    } else {
      this.logger.debug(
        "brain-data directory not empty, skipping seed content",
      );
    }
  }

  /**
   * Check if the brain-data directory is empty
   *
   * Returns false (not empty) if:
   * - Directory has content files (excluding .git and .gitkeep)
   * - Directory has .git with a configured remote (git-sync will pull data)
   *
   * This prevents seed content from overwriting git-synced data when
   * git-sync hasn't pulled yet during initialization.
   */
  private isBrainDataEmpty(brainDataPath: string): boolean {
    if (!existsSync(brainDataPath)) {
      return true;
    }

    const files = readdirSync(brainDataPath);
    const contentFiles = files.filter((f) => f !== ".git" && f !== ".gitkeep");

    if (contentFiles.length > 0) {
      return false;
    }

    // If .git has a remote, git-sync will pull real data -- skip seed content
    if (this.hasGitRemote(brainDataPath)) {
      this.logger.debug(
        "Git repository with remote detected - skipping seed content",
        { path: brainDataPath },
      );
      return false;
    }

    return true;
  }

  private hasGitRemote(dirPath: string): boolean {
    const gitDir = join(dirPath, ".git");
    if (!existsSync(gitDir)) {
      return false;
    }

    try {
      const result = execSync("git remote", {
        cwd: dirPath,
        encoding: "utf-8",
        stdio: ["pipe", "pipe", "pipe"],
      });
      return result.trim().length > 0;
    } catch {
      return false;
    }
  }

  private async copyDirectory(src: string, dest: string): Promise<void> {
    const entries = readdirSync(src, { withFileTypes: true });

    for (const entry of entries) {
      const srcPath = join(src, entry.name);
      const destPath = join(dest, entry.name);

      if (entry.isDirectory()) {
        if (!existsSync(destPath)) {
          mkdirSync(destPath, { recursive: true });
        }
        await this.copyDirectory(srcPath, destPath);
      } else {
        copyFileSync(srcPath, destPath);
      }
    }
  }

  protected override async getTools(): Promise<PluginTool[]> {
    const directorySync = this.requireDirectorySync();
    return createDirectorySyncTools(directorySync, this.getContext(), this.id);
  }

  protected override async onShutdown(): Promise<void> {
    this.directorySync?.stopWatching();
  }

  public getDirectorySync(): DirectorySync | undefined {
    return this.directorySync;
  }

  public async configure(options: { syncPath: string }): Promise<void> {
    this.requireDirectorySync();
    const context = this.getContext();
    this.directorySync = new DirectorySync({
      ...this.config,
      syncPath: options.syncPath,
      entityService: context.entityService,
      logger: context.logger,
    });

    await this.directorySync.initialize();
    this.logger.info("Directory sync reconfigured", { path: options.syncPath });
  }

  private registerMessageHandlers(context: ServicePluginContext): void {
    const { subscribe } = context.messaging;

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

    this.logger.debug("Registered message handlers");
  }

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
      this.logger.info("No sync operations needed", { operation });
      return `empty-sync-${Date.now()}`;
    }

    return result.batchId;
  }

  private setupAutoSync(context: ServicePluginContext): void {
    const { subscribe } = context.messaging;
    const { entityService } = context;
    const directorySync = this.requireDirectorySync();

    subscribe<{ entity: BaseEntity; entityType: string; entityId: string }>(
      "entity:created",
      async (message) => {
        const { entity } = message.payload;

        await directorySync.fileOps.writeEntity(entity);
        this.logger.debug("Auto-exported created entity", {
          id: entity.id,
          entityType: entity.entityType,
        });
        return { success: true };
      },
    );

    // Fetch current entity from DB instead of using event payload to avoid stale data
    subscribe<{ entity: BaseEntity; entityType: string; entityId: string }>(
      "entity:updated",
      async (message) => {
        const { entityType, entityId } = message.payload;

        const currentEntity = await entityService.getEntity(
          entityType,
          entityId,
        );
        if (!currentEntity) {
          this.logger.debug("Entity not found in DB, skipping export", {
            entityType,
            entityId,
          });
          return { success: false };
        }

        await directorySync.fileOps.writeEntity(currentEntity);
        this.logger.debug("Auto-exported updated entity", {
          id: currentEntity.id,
          entityType: currentEntity.entityType,
        });
        return { success: true };
      },
    );

    subscribe<{ entityId: string; entityType: string }>(
      "entity:deleted",
      async (message) => {
        const { entityId, entityType } = message.payload;

        const filePath = directorySync.fileOps.getFilePath(
          entityId,
          entityType,
        );
        const { unlinkSync, existsSync } = await import("fs");

        if (existsSync(filePath)) {
          unlinkSync(filePath);
          this.logger.debug("Auto-deleted entity file", {
            id: entityId,
            entityType,
            path: filePath,
          });
        }
        return { success: true };
      },
    );

    this.logger.debug("Setup auto-sync for entity events", {
      entityTypes: this.config.entityTypes,
    });
  }

  private setupFileWatcher(context: ServicePluginContext): void {
    const directorySync = this.requireDirectorySync();
    directorySync.setJobQueueCallback(async (job: JobRequest) => {
      const operations = [
        {
          type: job.type,
          data: job.data as Record<string, unknown>,
        },
      ];

      return context.jobs.enqueueBatch(operations, {
        priority: 5,
        source: "directory-sync-watcher",
        rootJobId: createId(),
        metadata: {
          operationType: "file_operations",
          operationTarget: this.config.syncPath,
          pluginId: "directory-sync",
        },
      });
    });
  }

  private async waitForJobs(
    context: ServicePluginContext,
    jobIds: string[],
    operationType: string,
  ): Promise<void> {
    const maxWaitTime = 30000;
    const checkInterval = 100;
    const startTime = Date.now();

    while (Date.now() - startTime < maxWaitTime) {
      const statuses = await Promise.all(
        jobIds.map((id) => context.jobs.getStatus(id)),
      );

      let allComplete = true;
      let failedCount = 0;
      let completedCount = 0;

      for (const status of statuses) {
        if (!status) continue;

        if (status.status === "pending" || status.status === "processing") {
          allComplete = false;
        } else if (status.status === "failed") {
          failedCount++;
        } else {
          completedCount++;
        }
      }

      if (allComplete) {
        this.logger.debug(`All ${operationType} jobs completed`, {
          total: jobIds.length,
          completed: completedCount,
          failed: failedCount,
        });
        return;
      }

      await new Promise((resolve) => setTimeout(resolve, checkInterval));
    }

    this.logger.warn(
      `Timeout waiting for ${operationType} jobs to complete after ${maxWaitTime}ms`,
    );
  }

  protected override async registerJobHandlers(
    context: ServicePluginContext,
  ): Promise<void> {
    const ds = this.requireDirectorySync();
    const childLogger = (name: string): Logger => this.logger.child(name);

    context.jobs.registerHandler(
      "directory-sync",
      new DirectorySyncJobHandler(
        childLogger("DirectorySyncJobHandler"),
        context,
        ds,
      ),
    );
    context.jobs.registerHandler(
      "directory-export",
      new DirectoryExportJobHandler(
        childLogger("DirectoryExportJobHandler"),
        context,
        ds,
      ),
    );
    context.jobs.registerHandler(
      "directory-import",
      new DirectoryImportJobHandler(
        childLogger("DirectoryImportJobHandler"),
        context,
        ds,
      ),
    );
    context.jobs.registerHandler(
      "directory-delete",
      new DirectoryDeleteJobHandler(
        childLogger("DirectoryDeleteJobHandler"),
        context,
        ds,
      ),
    );
    context.jobs.registerHandler(
      "cover-image-convert",
      new CoverImageConversionJobHandler(
        context,
        childLogger("CoverImageConversionJobHandler"),
      ),
    );
    context.jobs.registerHandler(
      "inline-image-convert",
      new InlineImageConversionJobHandler(
        context,
        childLogger("InlineImageConversionJobHandler"),
      ),
    );

    this.logger.debug("Registered async job handlers");
  }
}

export function directorySync(
  config: Partial<DirectorySyncConfig> = {},
): Plugin {
  return new DirectorySyncPlugin(config);
}
