import type {
  BaseEntity,
  IEntityService,
  ServicePluginContext,
} from "@brains/plugins";
import { BatchOperationsManager } from "./batch-operations";
import type { BatchMetadata } from "./batch-operations";
import type { Logger, ProgressReporter } from "@brains/utils";
import { resolve, isAbsolute } from "path";
import { mkdir } from "fs/promises";
import type {
  DirectorySyncStatus,
  ExportResult,
  IDirectorySync,
  ImportResult,
  JobRequest,
} from "../types";
import type { FileWatcher } from "./file-watcher";
import { FileOperations } from "./file-operations";
import { ProgressOperations } from "./progress-operations";
import { startDirectoryWatcher } from "./directory-watcher";
import { FrontmatterImageConverter } from "./frontmatter-image-converter";
import { MarkdownImageConverter } from "./markdown-image-converter";
import { Quarantine } from "./quarantine";
import type { ImageJobQueueDeps } from "./image-job-queue";
import { getDirectorySyncStatus } from "./directory-status";
import { importEntities as runImport } from "./import-pipeline";
import {
  exportEntities as runExport,
  processEntityExport as runProcessEntityExport,
} from "./export-pipeline";
import {
  removeOrphanedEntities as runCleanup,
  type CleanupResult,
} from "./cleanup-pipeline";
import {
  directorySyncOptionsSchema,
  type DirectorySyncOptions,
} from "./directory-options";

export { directorySyncOptionsSchema } from "./directory-options";
export type { DirectorySyncOptions } from "./directory-options";

export class DirectorySync implements IDirectorySync {
  private entityService: IEntityService;
  private logger: Logger;
  private syncPath: string;
  private autoSync: boolean;
  private watchInterval: number;
  private deleteOnFileRemoval: boolean;
  private entityTypes: string[] | undefined;
  private fileWatcher: FileWatcher | undefined;
  private lastSync: Date | undefined;
  private syncInProgress = false;
  private batchOperationsManager: BatchOperationsManager;
  private fileOperations: FileOperations;
  private progressOperations: ProgressOperations;
  private coverImageConverter: FrontmatterImageConverter;
  private inlineImageConverter: MarkdownImageConverter;
  private quarantine: Quarantine;
  private jobQueueCallback?: ((job: JobRequest) => Promise<string>) | undefined;

  constructor(options: DirectorySyncOptions) {
    const { entityService, logger, ...validatableOptions } = options;
    directorySyncOptionsSchema.parse(validatableOptions);

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
    this.quarantine = new Quarantine(this.logger, this.syncPath);

    this.logger.debug("Initialized with path", {
      originalPath: options.syncPath,
      resolvedPath: this.syncPath,
    });
  }

  private getImageJobQueueDeps(): ImageJobQueueDeps {
    return {
      logger: this.logger,
      syncPath: this.syncPath,
      jobQueueCallback: this.jobQueueCallback,
      coverImageConverter: this.coverImageConverter,
      inlineImageConverter: this.inlineImageConverter,
    };
  }

  async initialize(): Promise<void> {
    this.logger.debug("Initializing directory sync", { path: this.syncPath });
    await this.ensureSyncPath();

    if (this.autoSync) {
      void this.startWatching();
    }
  }

  async initializeDirectory(): Promise<void> {
    this.logger.debug("Initializing directory structure", {
      path: this.syncPath,
    });
    await this.ensureSyncPath();
  }

  private async ensureSyncPath(): Promise<void> {
    await mkdir(this.syncPath, { recursive: true });
  }

  setJobQueueCallback(callback: (job: JobRequest) => Promise<string>): void {
    this.jobQueueCallback = callback;
  }

  /**
   * Sync entities from directory to database.
   *
   * NOTE: This method only imports (files -> DB). Export (DB -> files) is handled
   * by entity:created/entity:updated subscribers when autoSync is enabled.
   */
  async sync(): Promise<{
    export: ExportResult;
    import: ImportResult;
    duration: number;
  }> {
    const startTime = Date.now();
    this.logger.debug("Starting sync (import only)");

    const importResult = await this.importEntities();

    // Remove DB entities whose files no longer exist on disk
    // (e.g., files deleted via git pull before the file watcher started)
    const cleanupResult = await this.removeOrphanedEntities();

    const duration = Date.now() - startTime;
    this.lastSync = new Date();

    this.logger.debug("Sync completed", {
      duration,
      imported: importResult.imported,
      orphansDeleted: cleanupResult.deleted,
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
    return runProcessEntityExport(
      {
        entityService: this.entityService,
        logger: this.logger,
        fileOperations: this.fileOperations,
        deleteOnFileRemoval: this.deleteOnFileRemoval,
        entityTypes: this.entityTypes,
      },
      entity,
    );
  }

  async exportEntities(entityTypes?: string[]): Promise<ExportResult> {
    return runExport(
      {
        entityService: this.entityService,
        logger: this.logger,
        fileOperations: this.fileOperations,
        deleteOnFileRemoval: this.deleteOnFileRemoval,
        entityTypes: this.entityTypes,
      },
      entityTypes,
    );
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
      this.exportEntities.bind(this),
    );
  }

  async importEntities(paths?: string[]): Promise<ImportResult> {
    return runImport(
      {
        entityService: this.entityService,
        logger: this.logger,
        fileOperations: this.fileOperations,
        quarantine: this.quarantine,
        imageJobQueue: this.getImageJobQueueDeps(),
        entityTypes: this.entityTypes,
      },
      paths,
    );
  }

  async removeOrphanedEntities(): Promise<CleanupResult> {
    const result = await runCleanup({
      entityService: this.entityService,
      logger: this.logger,
      fileOperations: this.fileOperations,
      deleteOnFileRemoval: this.deleteOnFileRemoval,
      entityTypes: this.entityTypes,
    });

    if (result.deleted > 0) {
      this.logger.info("Cleaned up orphaned entities", {
        deleted: result.deleted,
      });
    }

    return result;
  }

  get fileOps(): FileOperations {
    return this.fileOperations;
  }

  get shouldDeleteOnFileRemoval(): boolean {
    return this.deleteOnFileRemoval;
  }

  async getAllMarkdownFiles(): Promise<string[]> {
    return this.fileOperations.getAllMarkdownFiles();
  }

  async ensureDirectoryStructure(): Promise<void> {
    const entityTypes = this.entityTypes ?? this.entityService.getEntityTypes();
    await this.fileOperations.ensureDirectoryStructure(entityTypes);
  }

  async getStatus(): Promise<DirectorySyncStatus> {
    return getDirectorySyncStatus(
      this.fileOperations,
      this.syncPath,
      this.fileWatcher,
      this.lastSync,
    );
  }

  async queueSyncBatch(
    pluginContext: ServicePluginContext,
    source: string,
    metadata?: BatchMetadata,
    options?: { includeCleanup?: boolean },
  ): Promise<{
    batchId: string;
    operationCount: number;
    exportOperationsCount: number;
    importOperationsCount: number;
    totalFiles: number;
  } | null> {
    if (this.syncInProgress) {
      this.logger.debug("Sync already in progress, skipping", { source });
      return null;
    }

    this.syncInProgress = true;
    try {
      const files = await this.fileOperations.getAllSyncFiles();

      return await this.batchOperationsManager.queueSyncBatch(
        pluginContext,
        source,
        files,
        metadata,
        options,
      );
    } finally {
      this.syncInProgress = false;
    }
  }

  async startWatching(): Promise<void> {
    if (this.fileWatcher?.isWatching()) {
      this.logger.debug("Already watching directory");
      return;
    }

    this.fileWatcher = await startDirectoryWatcher({
      logger: this.logger,
      syncPath: this.syncPath,
      watchInterval: this.watchInterval,
      importEntities: this.importEntities.bind(this),
      jobQueueCallback: this.jobQueueCallback,
      fileOperations: this.fileOperations,
      deleteOnFileRemoval: this.deleteOnFileRemoval,
    });
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
