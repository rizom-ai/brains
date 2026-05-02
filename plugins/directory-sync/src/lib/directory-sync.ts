import type {
  BaseEntity,
  IEntityService,
  ServicePluginContext,
} from "@brains/plugins";
import type { BatchMetadata, BatchResult } from "./batch-operations";
import type { Logger, ProgressReporter } from "@brains/utils";
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
import {
  setDirectoryWatchCallback,
  startDirectoryWatcherIfNeeded,
  stopDirectoryWatcher,
} from "./directory-watcher";
import { runDirectorySync } from "./directory-sync-runner";
import type { DirectoryBatchQueue } from "./directory-batch-queue";
import {
  createDirectoryOperationDeps,
  createDirectorySyncDependencies,
} from "./directory-dependencies";
import type { DirectoryOperationDeps } from "./directory-operation-deps";
import {
  initializeDirectoryStructure,
  initializeDirectorySync,
} from "./directory-lifecycle";
import { getDirectorySyncStatus } from "./directory-status";
import {
  exportDirectoryEntities,
  importDirectoryEntities,
  processDirectoryEntityExport,
  removeOrphanedDirectoryEntities,
  type CleanupResult,
} from "./directory-operations";
import {
  exportDirectoryEntitiesWithProgress,
  importDirectoryEntitiesWithProgress,
} from "./directory-progress";
import {
  normalizeDirectorySyncOptions,
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
    const normalizedOptions = normalizeDirectorySyncOptions(options);

    this.entityService = options.entityService;
    this.logger = options.logger.child("DirectorySync");

    this.syncPath = normalizedOptions.syncPath;

    this.autoSync = normalizedOptions.autoSync;
    this.watchInterval = normalizedOptions.watchInterval;
    this.deleteOnFileRemoval = normalizedOptions.deleteOnFileRemoval;
    this.entityTypes = normalizedOptions.entityTypes;

    const dependencies = createDirectorySyncDependencies(
      this.logger,
      this.entityService,
      this.syncPath,
    );
    this.fileOperations = dependencies.fileOperations;
    this.batchQueue = dependencies.batchQueue;
    this.progressOperations = dependencies.progressOperations;
    this.operationDeps = createDirectoryOperationDeps(
      this.logger,
      this.entityService,
      this.syncPath,
      dependencies,
      (): ((job: JobRequest) => Promise<string>) | undefined =>
        this.jobQueueCallback,
    );

    this.logger.debug("Initialized with path", {
      originalPath: normalizedOptions.originalSyncPath,
      resolvedPath: this.syncPath,
    });
  }

  async initialize(): Promise<void> {
    await initializeDirectorySync(
      this.logger,
      this.syncPath,
      this.autoSync,
      this.startWatching.bind(this),
    );
  }

  async initializeDirectory(): Promise<void> {
    await initializeDirectoryStructure(this.logger, this.syncPath);
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
    return processDirectoryEntityExport(
      this.operationDeps,
      this.deleteOnFileRemoval,
      this.entityTypes,
      entity,
    );
  }

  async exportEntities(entityTypes?: string[]): Promise<ExportResult> {
    return exportDirectoryEntities(
      this.operationDeps,
      this.deleteOnFileRemoval,
      this.entityTypes,
      entityTypes,
    );
  }

  async importEntitiesWithProgress(
    paths: string[] | undefined,
    reporter: ProgressReporter,
    batchSize: number,
  ): Promise<ImportResult> {
    return importDirectoryEntitiesWithProgress(
      this.progressOperations,
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
    return exportDirectoryEntitiesWithProgress(
      this.progressOperations,
      this.entityTypes,
      entityTypes,
      reporter,
      batchSize,
      this.exportEntities.bind(this),
    );
  }

  async importEntities(paths?: string[]): Promise<ImportResult> {
    return importDirectoryEntities(this.operationDeps, this.entityTypes, paths);
  }

  async removeOrphanedEntities(): Promise<CleanupResult> {
    return removeOrphanedDirectoryEntities(
      this.operationDeps,
      this.logger,
      this.deleteOnFileRemoval,
      this.entityTypes,
    );
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
    this.fileWatcher = await startDirectoryWatcherIfNeeded(this.fileWatcher, {
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
    this.fileWatcher = stopDirectoryWatcher(this.fileWatcher);
  }

  setWatchCallback(callback: (event: string, path: string) => void): void {
    setDirectoryWatchCallback(this.fileWatcher, callback);
  }
}
