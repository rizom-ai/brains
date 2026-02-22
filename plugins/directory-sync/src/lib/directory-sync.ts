import type {
  ServicePluginContext,
  BaseEntity,
  IEntityService,
} from "@brains/plugins";
import type { Logger, ProgressReporter } from "@brains/utils";
import { resolve, isAbsolute, join } from "path";
import {
  existsSync,
  mkdirSync,
  renameSync,
  appendFileSync,
  readFileSync,
  writeFileSync,
} from "fs";
import { z, computeContentHash } from "@brains/utils";
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
import { FrontmatterImageConverter } from "./frontmatter-image-converter";
import { MarkdownImageConverter } from "./markdown-image-converter";

export const directorySyncOptionsSchema = z.object({
  syncPath: z.string(),
  autoSync: z.boolean().optional(),
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

export class DirectorySync {
  private entityService: IEntityService;
  private logger: Logger;
  private syncPath: string;
  private autoSync: boolean;
  private watchInterval: number;
  private deleteOnFileRemoval: boolean;
  private entityTypes: string[] | undefined;
  private fileWatcher: FileWatcher | undefined;
  private lastSync: Date | undefined;
  private batchOperationsManager: BatchOperationsManager;
  private fileOperations: FileOperations;
  private progressOperations: ProgressOperations;
  private coverImageConverter: FrontmatterImageConverter;
  private inlineImageConverter: MarkdownImageConverter;
  private jobQueueCallback?: ((job: JobRequest) => Promise<string>) | undefined;

  constructor(options: DirectorySyncOptions) {
    const { entityService, logger, ...validatableOptions } = options;
    directorySyncOptionsSchema
      .omit({ entityService: true, logger: true })
      .parse(validatableOptions);

    this.entityService = entityService;
    this.logger = logger.child("DirectorySync");

    this.syncPath = isAbsolute(options.syncPath)
      ? options.syncPath
      : resolve(process.cwd(), options.syncPath);

    this.autoSync = options.autoSync ?? true;
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
    this.coverImageConverter = new FrontmatterImageConverter(
      this.entityService,
      this.logger,
    );
    this.inlineImageConverter = new MarkdownImageConverter(
      this.entityService,
      this.logger,
    );

    this.logger.debug("Initialized with path", {
      originalPath: options.syncPath,
      resolvedPath: this.syncPath,
    });
  }

  async initialize(): Promise<void> {
    this.logger.debug("Initializing directory sync", { path: this.syncPath });
    this.ensureSyncPath();

    if (this.autoSync) {
      void this.startWatching();
    }
  }

  async initializeDirectory(): Promise<void> {
    this.logger.debug("Initializing directory structure", {
      path: this.syncPath,
    });
    this.ensureSyncPath();
  }

  private ensureSyncPath(): void {
    if (!existsSync(this.syncPath)) {
      mkdirSync(this.syncPath, { recursive: true });
      this.logger.info("Created sync directory", { path: this.syncPath });
    }
  }

  setJobQueueCallback(callback: (job: JobRequest) => Promise<string>): void {
    this.jobQueueCallback = callback;
  }

  /**
   * Sync entities from directory to database.
   *
   * NOTE: This method only imports (files → DB). Export (DB → files) is handled
   * by entity:created/entity:updated subscribers when autoSync is enabled.
   * This design eliminates the race condition where export would write stale
   * content before import jobs complete.
   */
  async sync(): Promise<SyncResult> {
    const startTime = Date.now();
    this.logger.debug("Starting sync (import only)");

    // Export is handled by entity:created/entity:updated subscribers when autoSync is enabled
    const importResult = await this.importEntities();

    const duration = Date.now() - startTime;
    this.lastSync = new Date();

    this.logger.debug("Sync completed", {
      duration,
      imported: importResult.imported,
    });

    return {
      export: { exported: 0, failed: 0, errors: [] },
      import: importResult,
      duration,
    };
  }

  async processEntityExport(entity: BaseEntity): Promise<{
    success: boolean;
    deleted?: boolean;
    error?: string;
  }> {
    try {
      const filePath = this.fileOperations.getEntityFilePath(entity);
      if (!this.fileOperations.fileExists(filePath)) {
        if (this.deleteOnFileRemoval) {
          this.logger.debug("File missing, deleting entity from DB", {
            entityId: entity.id,
            entityType: entity.entityType,
          });
          await this.entityService.deleteEntity(entity.entityType, entity.id);
          return { success: true, deleted: true };
        }
      }

      await this.fileOperations.writeEntity(entity);
      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

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

    for (const entityType of typesToExport) {
      const entities = await this.entityService.listEntities(entityType, {
        limit: 1000,
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

  private async importFile(
    filePath: string,
    result: ImportResult,
  ): Promise<void> {
    if (filePath.endsWith(".invalid")) {
      return;
    }

    try {
      const rawEntity = await this.fileOperations.readEntity(filePath);

      if (
        this.entityTypes &&
        !this.entityTypes.includes(rawEntity.entityType)
      ) {
        result.skipped++;
        return;
      }

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

  private isValidationError(error: unknown): boolean {
    if (error instanceof z.ZodError) {
      return true;
    }
    const message = error instanceof Error ? error.message : String(error);
    return (
      message.includes("invalid_type") ||
      message.includes("invalid_enum_value") ||
      message.includes("Required") ||
      message.includes("Invalid frontmatter") ||
      message.includes("Unknown entity type")
    );
  }

  private resolveFilePath(filePath: string): string {
    return filePath.startsWith(this.syncPath)
      ? filePath
      : join(this.syncPath, filePath);
  }

  private queueJob(job: JobRequest, filePath: string, label: string): void {
    if (!this.jobQueueCallback) return;
    this.jobQueueCallback(job).catch((error) => {
      this.logger.warn(`Failed to queue ${label} job`, {
        filePath,
        error: error instanceof Error ? error.message : String(error),
      });
    });
  }

  private queueCoverImageConversionIfNeeded(
    content: string,
    filePath: string,
  ): void {
    if (!this.jobQueueCallback) return;

    const detection = this.coverImageConverter.detectCoverImageUrl(content);
    if (!detection) return;

    this.queueJob(
      {
        type: "cover-image-convert",
        data: {
          filePath: this.resolveFilePath(filePath),
          sourceUrl: detection.sourceUrl,
          postTitle: detection.postTitle,
          postSlug: detection.postSlug,
          customAlt: detection.customAlt,
        },
      },
      filePath,
      "cover image conversion",
    );

    this.logger.debug("Queued cover image conversion job", {
      filePath,
      sourceUrl: detection.sourceUrl,
    });
  }

  private queueInlineImageConversionIfNeeded(
    content: string,
    filePath: string,
    postSlug: string,
  ): void {
    if (!this.jobQueueCallback) return;

    const detections = this.inlineImageConverter.detectInlineImages(
      content,
      postSlug,
    );
    if (detections.length === 0) return;

    this.queueJob(
      {
        type: "inline-image-convert",
        data: {
          filePath: this.resolveFilePath(filePath),
          postSlug,
        },
      },
      filePath,
      "inline image conversion",
    );

    this.logger.debug("Queued inline image conversion job", {
      filePath,
      imageCount: detections.length,
    });
  }

  private async processEntityImport(
    rawEntity: RawEntity,
    filePath: string,
    result: ImportResult,
  ): Promise<void> {
    // Queue non-blocking image conversions
    this.queueCoverImageConversionIfNeeded(rawEntity.content, filePath);
    this.queueInlineImageConversionIfNeeded(
      rawEntity.content,
      filePath,
      rawEntity.id,
    );

    // Deserialize -- validation errors quarantine the file
    let parsedEntity;
    try {
      parsedEntity = this.entityService.deserializeEntity(
        rawEntity.content,
        rawEntity.entityType,
      );
    } catch (error) {
      this.quarantineInvalidFile(filePath, error, result);
      return;
    }

    // Database operations -- transient errors fail without quarantining
    try {
      const existing = await this.entityService.getEntity(
        rawEntity.entityType,
        rawEntity.id,
      );

      if (
        existing &&
        !this.fileOperations.shouldUpdateEntity(existing, rawEntity)
      ) {
        result.skipped++;
        return;
      }

      const entity = {
        id: rawEntity.id,
        entityType: rawEntity.entityType,
        content: rawEntity.content,
        contentHash: computeContentHash(rawEntity.content),
        ...parsedEntity,
        metadata: parsedEntity.metadata ?? {},
        created: existing?.created ?? rawEntity.created.toISOString(),
        updated: rawEntity.updated.toISOString(),
      };

      const upsertResult = await this.entityService.upsertEntity(entity);
      result.imported++;
      result.jobIds.push(upsertResult.jobId);
      this.logger.debug("Imported entity from directory", {
        path: filePath,
        entityType: rawEntity.entityType,
        id: rawEntity.id,
        jobId: upsertResult.jobId,
      });

      this.markAsRecoveredIfNeeded(filePath);
    } catch (error) {
      if (this.isValidationError(error)) {
        this.quarantineInvalidFile(filePath, error, result);
        return;
      }

      result.failed++;
      result.errors.push({
        path: filePath,
        error:
          error instanceof Error
            ? `Transient error (file not quarantined): ${error.message}`
            : String(error),
      });
      this.logger.warn(
        "Failed to import entity (transient error, not quarantined)",
        {
          path: filePath,
          entityType: rawEntity.entityType,
          id: rawEntity.id,
          error: error instanceof Error ? error.message : String(error),
        },
      );
    }
  }

  private markAsRecoveredIfNeeded(filePath: string): void {
    const errorLogPath = join(this.syncPath, ".import-errors.log");

    if (!existsSync(errorLogPath)) {
      return;
    }

    try {
      const logContent = readFileSync(errorLogPath, "utf-8");

      if (logContent.includes(filePath)) {
        const timestamp = new Date().toISOString();
        const recoveryMarker = `${timestamp} - [RECOVERED] ${filePath}\n`;
        const lines = logContent.split("\n");
        const newLines: string[] = [];
        let skipNext = false;

        for (const line of lines) {
          if (skipNext) {
            skipNext = false;
            continue;
          }

          if (line.includes(filePath) && !line.includes("[RECOVERED]")) {
            newLines.push(recoveryMarker.trim());
            skipNext = true;
          } else {
            newLines.push(line);
          }
        }

        writeFileSync(errorLogPath, newLines.join("\n"));

        this.logger.debug("Marked file as recovered in error log", {
          path: filePath,
        });
      }
    } catch (error) {
      this.logger.debug("Could not update error log for recovered file", {
        path: filePath,
        error,
      });
    }
  }

  private quarantineInvalidFile(
    filePath: string,
    error: unknown,
    result: ImportResult,
  ): void {
    const fullPath = this.resolveFilePath(filePath);

    const quarantinePath = `${fullPath}.invalid`;

    try {
      renameSync(fullPath, quarantinePath);
      result.quarantined++;
      result.quarantinedFiles.push(filePath);

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

    const filesToProcess = paths ?? this.fileOperations.getAllSyncFiles();

    for (const filePath of filesToProcess) {
      await this.importFile(filePath, result);
    }

    this.logImportSummary(filesToProcess.length, result);
    return result;
  }

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
      this.logger.debug("Import completed", result);
    }
  }

  get fileOps(): FileOperations {
    return this.fileOperations;
  }

  get shouldDeleteOnFileRemoval(): boolean {
    return this.deleteOnFileRemoval;
  }

  getAllMarkdownFiles(): string[] {
    return this.fileOperations.getAllMarkdownFiles();
  }

  async ensureDirectoryStructure(): Promise<void> {
    const entityTypes = this.entityTypes ?? this.entityService.getEntityTypes();
    await this.fileOperations.ensureDirectoryStructure(entityTypes);
  }

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
    const entityTypes = this.entityTypes ?? this.entityService.getEntityTypes();
    const files = this.fileOperations.getAllMarkdownFiles();

    return this.batchOperationsManager.queueSyncBatch(
      pluginContext,
      source,
      entityTypes,
      files,
      metadata,
    );
  }

  async startWatching(): Promise<void> {
    if (this.fileWatcher?.isWatching()) {
      this.logger.debug("Already watching directory");
      return;
    }

    const eventHandler = new EventHandler(
      this.logger,
      this.importEntities.bind(this),
      this.jobQueueCallback,
      this.fileOperations,
      this.deleteOnFileRemoval,
    );

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

  stopWatching(): void {
    if (this.fileWatcher) {
      this.fileWatcher.stop();
      this.fileWatcher = undefined;
    }
  }

  setWatchCallback(callback: (event: string, path: string) => void): void {
    if (this.fileWatcher) {
      this.fileWatcher.setCallback(callback);
    }
  }
}
