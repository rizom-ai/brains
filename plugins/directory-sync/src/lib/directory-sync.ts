import type { Logger, ServicePluginContext, BaseEntity } from "@brains/plugins";
import type { IEntityService, ProgressReporter } from "@brains/plugins";
import { resolve, isAbsolute, join } from "path";
import {
  existsSync,
  mkdirSync,
  renameSync,
  appendFileSync,
  readFileSync,
  writeFileSync,
} from "fs";
import { z } from "@brains/utils";
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
import { ProgressOperations } from "./progress-operations";
import { EventHandler } from "./event-handler";

/**
 * DirectorySync options schema
 */
export const directorySyncOptionsSchema = z.object({
  syncPath: z.string(),
  autoSync: z.boolean().optional(),
  syncDebounce: z.number().optional(),
  watchInterval: z.number().optional(),
  includeMetadata: z.boolean().optional(),
  entityTypes: z.array(z.string()).optional(),
  deleteOnFileRemoval: z.boolean().optional(),
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
  private autoSync: boolean;
  private syncDebounce: number;
  private watchInterval: number;
  private deleteOnFileRemoval: boolean;
  private entityTypes: string[] | undefined;
  private fileWatcher: FileWatcher | undefined;
  private lastSync: Date | undefined;
  private batchOperationsManager: BatchOperationsManager;
  private fileOperations: FileOperations;
  private progressOperations: ProgressOperations;
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

    this.autoSync = options.autoSync ?? true;
    this.syncDebounce = options.syncDebounce ?? 1000;
    this.watchInterval = options.watchInterval ?? 5000;
    this.deleteOnFileRemoval = options.deleteOnFileRemoval ?? true;
    this.entityTypes = options.entityTypes;
    this.batchOperationsManager = new BatchOperationsManager(
      this.logger,
      this.syncPath,
    );
    this.fileOperations = new FileOperations(this.syncPath, this.entityService);
    this.progressOperations = new ProgressOperations(
      this.logger,
      this.entityService,
      this.fileOperations,
    );

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

    // Start file watching if autoSync enabled (for bidirectional sync)
    if (this.autoSync) {
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
   * Process export for a single entity
   * Checks if file exists and either writes or deletes entity accordingly
   */
  async processEntityExport(entity: BaseEntity): Promise<{
    success: boolean;
    deleted?: boolean;
    error?: string;
  }> {
    try {
      // Check if file exists
      const filePath = this.fileOperations.getEntityFilePath(entity);
      const fileExists = await this.fileOperations.fileExists(filePath);

      if (!fileExists) {
        // File was deleted - delete entity from DB if configured
        if (this.deleteOnFileRemoval) {
          this.logger.debug("File missing, deleting entity from DB", {
            entityId: entity.id,
            entityType: entity.entityType,
          });
          await this.entityService.deleteEntity(entity.entityType, entity.id);
          return { success: true, deleted: true };
        }
      }

      // File exists or deleteOnFileRemoval is false - write/update it
      await this.fileOperations.writeEntity(entity);
      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Export all entities to directory
   */
  async exportEntities(entityTypes?: string[]): Promise<ExportResult> {
    const typesToExport =
      entityTypes ?? this.entityTypes ?? this.entityService.getEntityTypes();

    this.logger.debug("Exporting entities to directory", {
      entityTypes: typesToExport,
    });

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

      this.logger.debug("Processing entity type for export", {
        entityType,
        count: entities.length,
      });

      for (const entity of entities) {
        const exportResult = await this.processEntityExport(entity);

        if (exportResult.success) {
          result.exported++;
          if (exportResult.deleted) {
            this.logger.debug("Deleted entity from DB (file missing)", {
              entityType,
              id: entity.id,
            });
          }
        } else {
          result.failed++;
          result.errors.push({
            entityId: entity.id,
            entityType,
            error: exportResult.error ?? "Unknown error",
          });
          this.logger.error("Failed to export entity", {
            entityType,
            id: entity.id,
            error: exportResult.error,
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
    return this.progressOperations.importEntitiesWithProgress(
      paths,
      reporter,
      batchSize,
      this.importEntities.bind(this),
    );
  }

  /**
   * Export entities to directory with progress reporting
   */
  async exportEntitiesWithProgress(
    entityTypes: string[] | undefined,
    reporter: ProgressReporter,
    batchSize: number,
  ): Promise<ExportResult> {
    const typesToExport = entityTypes ?? this.entityTypes;
    return this.progressOperations.exportEntitiesWithProgress(
      typesToExport,
      reporter,
      batchSize,
    );
  }

  /**
   * Import a single file
   */
  private async importFile(
    filePath: string,
    result: ImportResult,
  ): Promise<void> {
    // Skip .invalid files
    if (filePath.endsWith(".invalid")) {
      return;
    }

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

      if (
        existing &&
        !this.fileOperations.shouldUpdateEntity(existing, rawEntity)
      ) {
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
        metadata: parsedEntity.metadata ?? {},
        created: existing?.created ?? rawEntity.created.toISOString(),
        updated: rawEntity.updated.toISOString(),
      };

      const upsertResult = await this.entityService.upsertEntity(entity);
      result.imported++;
      result.jobIds.push(upsertResult.jobId); // Track job for waiting
      this.logger.debug("Imported entity from directory", {
        path: filePath,
        entityType: rawEntity.entityType,
        id: rawEntity.id,
        jobId: upsertResult.jobId,
      });

      // Mark as recovered in error log if it was previously quarantined
      this.markAsRecoveredIfNeeded(filePath);
    } catch (error) {
      // Quarantine file if deserialization fails
      this.quarantineInvalidFile(filePath, error, result);
    }
  }

  /**
   * Mark a file as recovered in the error log if it was previously quarantined
   */
  private markAsRecoveredIfNeeded(filePath: string): void {
    const errorLogPath = join(this.syncPath, ".import-errors.log");

    // Check if error log exists
    if (!existsSync(errorLogPath)) {
      return;
    }

    try {
      // Read current log content
      const logContent = readFileSync(errorLogPath, "utf-8");

      // Check if this file is mentioned in the error log
      if (logContent.includes(filePath)) {
        // Replace entries for this file with [RECOVERED] marker
        const timestamp = new Date().toISOString();
        const recoveryMarker = `${timestamp} - [RECOVERED] ${filePath}\n`;

        // Find and replace the error entry for this file
        const lines = logContent.split("\n");
        const newLines: string[] = [];
        let skipNext = false;

        for (const line of lines) {
          if (skipNext) {
            skipNext = false;
            continue;
          }

          if (line.includes(filePath) && !line.includes("[RECOVERED]")) {
            // Replace with recovery marker
            newLines.push(recoveryMarker.trim());
            // Skip the arrow line
            skipNext = true;
          } else {
            newLines.push(line);
          }
        }

        // Write updated content back
        writeFileSync(errorLogPath, newLines.join("\n"));

        this.logger.debug("Marked file as recovered in error log", {
          path: filePath,
        });
      }
    } catch (error) {
      // Non-critical, just log debug
      this.logger.debug("Could not update error log for recovered file", {
        path: filePath,
        error,
      });
    }
  }

  /**
   * Quarantine an invalid file by renaming it and logging the error
   */
  private quarantineInvalidFile(
    filePath: string,
    error: unknown,
    result: ImportResult,
  ): void {
    const fullPath = filePath.startsWith(this.syncPath)
      ? filePath
      : join(this.syncPath, filePath);

    const quarantinePath = `${fullPath}.invalid`;

    try {
      // Rename file to .invalid
      renameSync(fullPath, quarantinePath);

      // Track in result
      result.quarantined++;
      result.quarantinedFiles.push(filePath);

      // Log error to .import-errors.log
      const errorLogPath = join(this.syncPath, ".import-errors.log");
      const timestamp = new Date().toISOString();
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      const logEntry = `${timestamp} - ${filePath}: ${errorMessage}\n→ ${filePath}.invalid\n\n`;

      appendFileSync(errorLogPath, logEntry);

      this.logger.warn("Quarantined invalid entity file", {
        originalPath: filePath,
        quarantinePath: `${filePath}.invalid`,
        error: errorMessage,
      });
    } catch (renameError) {
      // If we can't quarantine, just log and skip
      this.logger.error("Failed to quarantine invalid file", {
        path: filePath,
        error: renameError,
      });
      result.failed++;
      result.errors.push({
        path: filePath,
        error: "Failed to quarantine invalid file",
      });
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
      quarantined: 0,
      quarantinedFiles: [],
      errors: [],
      jobIds: [],
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
        quarantined: result.quarantined,
      });
    } else {
      // For single file imports (like from file watcher), use debug level
      this.logger.debug("Import completed", result);
    }
  }

  /**
   * Get file operations instance (for handlers)
   */
  get fileOps(): FileOperations {
    return this.fileOperations;
  }

  /**
   * Get deleteOnFileRemoval config
   */
  get shouldDeleteOnFileRemoval(): boolean {
    return this.deleteOnFileRemoval;
  }

  /**
   * Get all markdown files (for tools)
   */
  getAllMarkdownFiles(): string[] {
    return this.fileOperations.getAllMarkdownFiles();
  }

  /**
   * Ensure directory structure exists (for tools)
   */
  async ensureDirectoryStructure(): Promise<void> {
    const entityTypes = this.entityTypes ?? this.entityService.getEntityTypes();
    await this.fileOperations.ensureDirectoryStructure(entityTypes);
  }

  /**
   * Get directory sync status
   */
  async getStatus(): Promise<DirectorySyncStatus> {
    const { files, stats } = this.fileOperations.gatherFileStatus();

    return {
      syncPath: this.syncPath,
      exists: this.fileOperations.syncDirectoryExists(),
      watching: this.fileWatcher?.isWatching() ?? false,
      lastSync: this.lastSync,
      files,
      stats,
    };
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

    // Create event handler for file changes
    const eventHandler = new EventHandler(
      this.logger,
      this.importEntities.bind(this),
      this.jobQueueCallback,
      this.fileOperations,
      this.deleteOnFileRemoval,
    );

    // Create file watcher with callback to handle changes
    this.fileWatcher = new FileWatcher({
      syncPath: this.syncPath,
      watchInterval: this.watchInterval,
      logger: this.logger,
      onFileChange: async (event: string, path: string): Promise<void> => {
        await eventHandler.handleFileChange(event, path);
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
   * Get sync debounce time
   */
  getSyncDebounce(): number {
    return this.syncDebounce;
  }
}
