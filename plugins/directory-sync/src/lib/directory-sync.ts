import type {
  BaseEntity,
  IEntityService,
  ServicePluginContext,
} from "@brains/plugins";
import type { BatchMetadata, BatchResult } from "./batch-operations";
import type { Logger, ProgressReporter } from "@brains/utils";
import { resolve, isAbsolute } from "path";
import { mkdir } from "fs/promises";
import type {
  DirectorySyncStatus,
  ExportResult,
  IDirectorySync,
  ImportResult,
  JobRequest,
  SyncResult,
} from "../types";
import type { FileWatcher } from "./file-watcher";
import type { FileOperations } from "./file-operations";
import type { ProgressOperations } from "./progress-operations";
import { startDirectoryWatcher } from "./directory-watcher";
import { runDirectorySync } from "./directory-sync-runner";
import type { DirectoryBatchQueue } from "./directory-batch-queue";
import { createDirectorySyncDependencies } from "./directory-dependencies";
import { DirectoryOperationDeps } from "./directory-operation-deps";
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
  private batchQueue: DirectoryBatchQueue;
  private fileOperations: FileOperations;
  private progressOperations: ProgressOperations;
  private operationDeps: DirectoryOperationDeps;
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

    const dependencies = createDirectorySyncDependencies(
      this.logger,
      this.entityService,
      this.syncPath,
    );
    this.fileOperations = dependencies.fileOperations;
    this.batchQueue = dependencies.batchQueue;
    this.progressOperations = dependencies.progressOperations;
    this.operationDeps = new DirectoryOperationDeps({
      entityService: this.entityService,
      logger: this.logger,
      syncPath: this.syncPath,
      fileOperations: this.fileOperations,
      quarantine: dependencies.quarantine,
      coverImageConverter: dependencies.coverImageConverter,
      inlineImageConverter: dependencies.inlineImageConverter,
      getJobQueueCallback: ():
        | ((job: JobRequest) => Promise<string>)
        | undefined => this.jobQueueCallback,
    });

    this.logger.debug("Initialized with path", {
      originalPath: options.syncPath,
      resolvedPath: this.syncPath,
    });
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
  async sync(): Promise<SyncResult> {
    return runDirectorySync({
      logger: this.logger,
      importEntities: this.importEntities.bind(this),
      removeOrphanedEntities: this.removeOrphanedEntities.bind(this),
      markSynced: (syncedAt) => {
        this.lastSync = syncedAt;
      },
    });
  }

  async processEntityExport(entity: BaseEntity): Promise<{
    success: boolean;
    deleted?: boolean;
    error?: string;
  }> {
    return runProcessEntityExport(
      this.operationDeps.createExportDeps(
        this.deleteOnFileRemoval,
        this.entityTypes,
      ),
      entity,
    );
  }

  async exportEntities(entityTypes?: string[]): Promise<ExportResult> {
    return runExport(
      this.operationDeps.createExportDeps(
        this.deleteOnFileRemoval,
        this.entityTypes,
      ),
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
      this.operationDeps.createImportDeps(this.entityTypes),
      paths,
    );
  }

  async removeOrphanedEntities(): Promise<CleanupResult> {
    const result = await runCleanup(
      this.operationDeps.createCleanupDeps(
        this.deleteOnFileRemoval,
        this.entityTypes,
      ),
    );

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
  ): Promise<BatchResult | null> {
    return this.batchQueue.queueSyncBatch(
      pluginContext,
      source,
      metadata,
      options,
    );
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
