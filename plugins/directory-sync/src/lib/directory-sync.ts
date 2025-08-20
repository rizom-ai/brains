import type { Logger, ServicePluginContext } from "@brains/plugins";
import type {
  IEntityService,
  BaseEntity,
  BatchOperation,
  ProgressReporter,
} from "@brains/plugins";
import { join, resolve, isAbsolute } from "path";
import {
  existsSync,
  statSync,
  mkdirSync,
} from "fs";
import { z } from "zod";
import type {
  DirectorySyncStatus,
  ExportResult,
  ImportResult,
  SyncResult,
  RawEntity,
  JobRequest,
} from "../types";
import { FileWatcher } from "./file-watcher";
import { BatchOperationsManager } from "./batch-operations";
import type { BatchMetadata } from "./batch-operations";
import { FileOperations } from "./file-operations";

/**
 * DirectorySync options schema
 */
export const directorySyncOptionsSchema = z.object({
  syncPath: z.string(),
  watchEnabled: z.boolean().optional(),
  watchInterval: z.number().optional(),
  includeMetadata: z.boolean().optional(),
  entityTypes: z.array(z.string()).optional(),
  entityService: z.any(), // We can't validate these complex types with Zod
  logger: z.any(),
});

export type DirectorySyncOptions = z.infer<
  typeof directorySyncOptionsSchema
> & {
  entityService: IEntityService;
  logger: Logger;
};

/**
 * DirectorySync handles synchronization of entities with a directory structure
 */
export class DirectorySync {
  private entityService: IEntityService;
  private logger: Logger;
  private syncPath: string;
  private watchEnabled: boolean;
  private watchInterval: number;
  private entityTypes: string[] | undefined;
  private fileWatcher: FileWatcher | undefined;
  private lastSync: Date | undefined;
  private batchOperationsManager: BatchOperationsManager;
  private fileOperations: FileOperations;
  private jobQueueCallback?: ((job: JobRequest) => Promise<string>) | undefined;

  constructor(options: DirectorySyncOptions) {
    // Validate options (excluding the complex types)
    const { entityService, logger, ...validatableOptions } = options;
    directorySyncOptionsSchema
      .omit({ entityService: true, logger: true })
      .parse(validatableOptions);

    this.entityService = entityService;
    this.logger = logger.child("DirectorySync");

    // Resolve sync path - support both relative and absolute paths
    this.syncPath = isAbsolute(options.syncPath)
      ? options.syncPath
      : resolve(process.cwd(), options.syncPath);

    this.watchEnabled = options.watchEnabled ?? false;
    this.watchInterval = options.watchInterval ?? 5000;
    this.entityTypes = options.entityTypes;
    this.batchOperationsManager = new BatchOperationsManager(this.logger, this.syncPath);
    this.fileOperations = new FileOperations(this.syncPath, this.entityService);

    this.logger.debug("Initialized with path", {
      originalPath: options.syncPath,
      resolvedPath: this.syncPath,
    });
  }

  /**
   * Initialize directory structure
   */
  async initialize(): Promise<void> {
    this.logger.debug("Initializing directory sync", { path: this.syncPath });

    // Ensure sync path exists
    if (!existsSync(this.syncPath)) {
      mkdirSync(this.syncPath, { recursive: true });
      this.logger.info("Created sync directory", {
        path: this.syncPath,
      });
    }

    // Start watching if enabled
    if (this.watchEnabled) {
      void this.startWatching();
    }
  }

  /**
   * Initialize directory structure only (no sync or watching)
   */
  async initializeDirectory(): Promise<void> {
    this.logger.debug("Initializing directory structure", {
      path: this.syncPath,
    });

    // Ensure sync path exists
    if (!existsSync(this.syncPath)) {
      mkdirSync(this.syncPath, { recursive: true });
      this.logger.info("Created sync directory", {
        path: this.syncPath,
      });
    }
  }

  /**
   * Set job queue callback for async operations
   */
  setJobQueueCallback(callback: (job: JobRequest) => Promise<string>): void {
    this.jobQueueCallback = callback;
  }

  /**
   * Sync all entities with directory
   */
  async sync(): Promise<SyncResult> {
    const startTime = Date.now();
    this.logger.debug("Starting full sync");

    // Import from directory first
    const importResult = await this.importEntities();

    // Export all entities
    const exportResult = await this.exportEntities();

    const duration = Date.now() - startTime;
    this.lastSync = new Date();

    this.logger.debug("Full sync completed", {
      duration,
      imported: importResult.imported,
      exported: exportResult.exported,
    });

    return {
      export: exportResult,
      import: importResult,
      duration,
    };
  }

  /**
   * Export all entities to directory
   */
  async exportEntities(entityTypes?: string[]): Promise<ExportResult> {
    this.logger.debug("Exporting entities to directory");

    const typesToExport =
      entityTypes ?? this.entityTypes ?? this.entityService.getEntityTypes();
    const result: ExportResult = {
      exported: 0,
      failed: 0,
      errors: [],
    };

    // For each entity type, get all entities and save to markdown
    for (const entityType of typesToExport) {
      const entities = await this.entityService.listEntities(entityType, {
        limit: 1000, // Get all entities
      });

      for (const entity of entities) {
        try {
          await this.fileOperations.writeEntity(entity);
          result.exported++;
          this.logger.debug("Exported entity", { entityType, id: entity.id });
        } catch {
          const exportError = new Error(`Failed to export entity ${entity.id}`);
          result.failed++;
          result.errors.push({
            entityId: entity.id,
            entityType,
            error: exportError.message,
          });
          this.logger.error("Failed to export entity", {
            entityType,
            id: entity.id,
            error: exportError,
          });
        }
      }
    }

    this.logger.debug("Export completed", result);
    return result;
  }

  /**
   * Import entities from directory with progress reporting
   */
  async importEntitiesWithProgress(
    paths: string[] | undefined,
    reporter: ProgressReporter,
    batchSize: number,
  ): Promise<ImportResult> {
    this.logger.debug("Importing entities with progress reporting");

    const result: ImportResult = {
      imported: 0,
      skipped: 0,
      failed: 0,
      errors: [],
    };

    // Get all files to process
    const filesToProcess = paths ?? this.fileOperations.getAllMarkdownFiles();
    const totalFiles = filesToProcess.length;

    // Report initial progress
    await reporter.report({
      progress: 0,
      message: `Starting import of ${totalFiles} files`,
    });

    // Process in batches for progress reporting
    for (let i = 0; i < totalFiles; i += batchSize) {
      const batch = filesToProcess.slice(i, i + batchSize);

      // Process batch
      const batchResult = await this.importEntities(batch);

      // Accumulate results
      result.imported += batchResult.imported;
      result.skipped += batchResult.skipped;
      result.failed += batchResult.failed;
      result.errors.push(...batchResult.errors);

      // Report progress
      const processed = Math.min(i + batchSize, totalFiles);
      const percentage = Math.round((processed / totalFiles) * 40); // Import is 0-40% of sync
      await reporter.report({
        progress: percentage,
        message: `Imported ${processed}/${totalFiles} files`,
      });
    }

    return result;
  }

  /**
   * Export entities to directory with progress reporting
   */
  async exportEntitiesWithProgress(
    entityTypes: string[] | undefined,
    reporter: ProgressReporter,
    batchSize: number,
  ): Promise<ExportResult> {
    this.logger.debug("Exporting entities with progress reporting");

    const typesToExport =
      entityTypes ?? this.entityTypes ?? this.entityService.getEntityTypes();
    const result: ExportResult = {
      exported: 0,
      failed: 0,
      errors: [],
    };

    const totalTypes = typesToExport.length;

    // Report initial progress
    await reporter.report({
      progress: 50, // Export starts at 50%
      message: `Starting export of ${totalTypes} entity types`,
    });

    // Process each entity type
    for (let typeIndex = 0; typeIndex < totalTypes; typeIndex++) {
      const entityType = typesToExport[typeIndex];
      if (!entityType) continue; // Skip if undefined
      const entities = await this.entityService.listEntities(entityType, {
        limit: 1000,
      });

      // Process entities in batches
      for (let i = 0; i < entities.length; i += batchSize) {
        const batch = entities.slice(i, i + batchSize);

        for (const entity of batch) {
          try {
            await this.fileOperations.writeEntity(entity);
            result.exported++;
            this.logger.debug("Exported entity", { entityType, id: entity.id });
          } catch {
            const exportError = new Error(
              `Failed to export entity ${entity.id || "unknown"}`,
            );
            result.failed++;
            result.errors.push({
              entityId: entity.id || "unknown",
              entityType,
              error: exportError.message,
            });
            this.logger.error("Failed to export entity", {
              entityType,
              id: entity.id || "unknown",
              error: exportError,
            });
          }
        }

        // Report progress for this batch
        const typeProgress = (typeIndex + 1) / totalTypes;
        const overallProgress = 50 + Math.round(typeProgress * 50); // Export is 50-100%
        await reporter.report({
          progress: overallProgress,
          message: `Exported ${result.exported} entities`,
        });
      }
    }

    this.logger.debug("Export completed", result);
    return result;
  }


  /**
   * Import a single file
   */
  private async importFile(
    filePath: string,
    result: ImportResult,
  ): Promise<void> {
    try {
      const rawEntity = await this.fileOperations.readEntity(filePath);

      // Skip if entity type is not in our filter
      if (
        this.entityTypes &&
        !this.entityTypes.includes(rawEntity.entityType)
      ) {
        result.skipped++;
        return;
      }

      // Try to process the entity
      await this.processEntityImport(rawEntity, filePath, result);
    } catch {
      const importError = new Error(`Failed to import entity from file`);
      result.failed++;
      result.errors.push({
        path: filePath,
        error: importError.message,
      });
      this.logger.error("Failed to import entity", {
        path: filePath,
        error: importError,
      });
    }
  }

  /**
   * Process entity import with deserialization and update check
   */
  private async processEntityImport(
    rawEntity: RawEntity,
    filePath: string,
    result: ImportResult,
  ): Promise<void> {
    try {
      // Deserialize the markdown content to get parsed fields
      const parsedEntity = this.entityService.deserializeEntity(
        rawEntity.content,
        rawEntity.entityType,
      );

      // Check if entity exists and compare content
      const existing = await this.entityService.getEntity(
        rawEntity.entityType,
        rawEntity.id,
      );

      if (existing && !this.fileOperations.shouldUpdateEntity(existing, rawEntity)) {
        // Skip if content hasn't changed
        result.skipped++;
        return;
      }

      // Build entity for upsert
      const entity = {
        id: rawEntity.id,
        entityType: rawEntity.entityType,
        content: rawEntity.content,
        ...parsedEntity,
        created: existing?.created ?? rawEntity.created.toISOString(),
        updated: rawEntity.updated.toISOString(),
      };

      await this.entityService.upsertEntity(entity);
      result.imported++;
      this.logger.debug("Imported entity from directory", {
        path: filePath,
        entityType: rawEntity.entityType,
      });
    } catch {
      // Skip if entity type is not registered or deserialization fails
      const serializationError = new Error(
        "Unable to deserialize entity from file",
      );
      this.logger.debug("Skipping file - unable to deserialize", {
        path: filePath,
        entityType: rawEntity.entityType,
        error: serializationError,
      });
      result.skipped++;
    }
  }

  /**
   * Import entities from directory
   */
  async importEntities(paths?: string[]): Promise<ImportResult> {
    this.logger.debug("Importing entities from directory");

    const result: ImportResult = {
      imported: 0,
      skipped: 0,
      failed: 0,
      errors: [],
    };

    // Get all files to process
    const filesToProcess = paths ?? this.fileOperations.getAllMarkdownFiles();

    // Process each file
    for (const filePath of filesToProcess) {
      await this.importFile(filePath, result);
    }

    // Log import summary
    this.logImportSummary(filesToProcess.length, result);
    return result;
  }

  /**
   * Log import operation summary
   */
  private logImportSummary(fileCount: number, result: ImportResult): void {
    if (fileCount > 1) {
      this.logger.debug("Import completed", {
        filesProcessed: fileCount,
        imported: result.imported,
        skipped: result.skipped,
        failed: result.failed,
      });
    } else {
      // For single file imports (like from file watcher), use debug level
      this.logger.debug("Import completed", result);
    }
  }


  /**
   * Get all markdown files in sync directory
   */
  public getAllMarkdownFiles(): string[] {
    return this.fileOperations.getAllMarkdownFiles();
  }

  /**
   * Write entity to file (wrapper for handlers)
   */
  async writeEntity(entity: BaseEntity): Promise<void> {
    await this.fileOperations.writeEntity(entity);
  }

  /**
   * Read entity from file (wrapper for handlers)
   */
  async readEntity(filePath: string): Promise<RawEntity> {
    return this.fileOperations.readEntity(filePath);
  }

  /**
   * Get directory sync status
   */
  async getStatus(): Promise<DirectorySyncStatus> {
    const exists = existsSync(this.syncPath);
    const files: DirectorySyncStatus["files"] = [];
    const stats: DirectorySyncStatus["stats"] = {
      totalFiles: 0,
      byEntityType: {},
    };

    if (exists) {
      const allFiles = this.fileOperations.getAllMarkdownFiles();

      for (const filePath of allFiles) {
        try {
          const fullPath = join(this.syncPath, filePath);
          const fileStat = statSync(fullPath);
          const pathParts = filePath.split("/");
          const entityType =
            pathParts.length > 1 && pathParts[0] ? pathParts[0] : "base";

          files.push({
            path: filePath,
            entityType,
            modified: fileStat.mtime,
          });

          stats.totalFiles++;
          stats.byEntityType[entityType] =
            (stats.byEntityType[entityType] ?? 0) + 1;
        } catch (error) {
          // Skip files that can't be read
          this.logger.debug("Skipping file in status", {
            path: filePath,
            error,
          });
        }
      }
    }

    return {
      syncPath: this.syncPath,
      exists,
      watching: this.fileWatcher?.isWatching() ?? false,
      lastSync: this.lastSync,
      files,
      stats,
    };
  }

  /**
   * Prepare batch operations for sync
   * Returns the operations needed without executing them
   */
  prepareBatchOperations(): {
    operations: BatchOperation[];
    totalFiles: number;
    exportOperationsCount: number;
    importOperationsCount: number;
  } {
    // Get entity types and files for batching
    const entityTypes = this.entityTypes ?? this.entityService.getEntityTypes();
    const filesToImport = this.fileOperations.getAllMarkdownFiles();

    // Use BatchOperationsManager to prepare operations
    return this.batchOperationsManager.prepareBatchOperations(
      entityTypes,
      filesToImport,
    );
  }

  /**
   * Queue a sync batch operation
   * Encapsulates the common pattern of preparing and queuing batch operations
   */
  async queueSyncBatch(
    pluginContext: ServicePluginContext,
    source: string,
    metadata?: BatchMetadata,
  ): Promise<{
    batchId: string;
    operationCount: number;
    exportOperationsCount: number;
    importOperationsCount: number;
    totalFiles: number;
  } | null> {
    // Get entity types and files
    const entityTypes = this.entityTypes ?? this.entityService.getEntityTypes();
    const files = this.fileOperations.getAllMarkdownFiles();
    
    // Use BatchOperationsManager to queue the batch
    return this.batchOperationsManager.queueSyncBatch(
      pluginContext,
      source,
      entityTypes,
      files,
      metadata,
    );
  }

  /**
   * Start watching directory for changes
   */
  async startWatching(): Promise<void> {
    if (this.fileWatcher?.isWatching()) {
      this.logger.debug("Already watching directory");
      return;
    }

    // Create file watcher with callback to handle changes
    this.fileWatcher = new FileWatcher({
      syncPath: this.syncPath,
      watchInterval: this.watchInterval,
      logger: this.logger,
      onFileChange: async (event: string, path: string) => {
        await this.handleFileChange(event, path);
      },
    });

    await this.fileWatcher.start();
  }

  /**
   * Stop watching directory
   */
  stopWatching(): void {
    if (this.fileWatcher) {
      this.fileWatcher.stop();
      this.fileWatcher = undefined;
    }
  }

  /**
   * Set watch callback for external handling
   */
  setWatchCallback(callback: (event: string, path: string) => void): void {
    if (this.fileWatcher) {
      this.fileWatcher.setCallback(callback);
    }
  }

  /**
   * Handle file change events from the file watcher
   */
  private async handleFileChange(event: string, path: string): Promise<void> {
    this.logger.debug("Processing file change", { event, path });

    try {
      // Handle different event types
      switch (event) {
        case "add":
        case "change":
          // Import the changed file
          if (this.jobQueueCallback) {
            const jobId = await this.jobQueueCallback({
              type: "directory-import" as const,
              data: {
                paths: [path],
              },
            });
            this.logger.debug("Queued import job for file change", {
              jobId,
              path,
            });
          } else {
            // Fallback to direct import
            await this.importEntities([path]);
          }
          break;

        case "delete":
        case "unlink":
          // Entity deletion is not handled automatically to prevent data loss
          this.logger.warn("File deleted, manual sync required", { path });
          break;

        default:
          this.logger.debug("Unhandled file event", { event, path });
      }
    } catch (error) {
      this.logger.error("Failed to handle file change", {
        event,
        path,
        error,
      });
    }
  }

  /**
   * Ensure directory structure exists
   */
  async ensureDirectoryStructure(): Promise<void> {
    const entityTypes = this.entityTypes ?? this.entityService.getEntityTypes();
    await this.fileOperations.ensureDirectoryStructure(entityTypes);
  }
}
