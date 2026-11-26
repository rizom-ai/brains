import type { PullConflict } from "../types/results";
import { SyncGuard, type RemovedFileOutcome } from "./sync-guard";
import type { ServiceEntityMirrorClient } from "@brains/sdk/internal/service-runtime";
import type { DirectorySyncCore } from "./sync-context";
import type { BaseEntity } from "@brains/sdk/internal/entity-runtime";
import { createId } from "@brains/utils/id";
import type { BatchMetadata, BatchResult } from "../types";
import type { Logger } from "@brains/utils/logger";
import type { ProgressReporter } from "@brains/utils/progress";
import type {
  CleanupResult,
  DirectoryProjectionBatchRef,
  DirectorySyncStatus,
  ExportResult,
  IDirectorySync,
  ImportResult,
  JobRequest,
  SyncResult,
} from "../types";
import type { FileWatcher, MatchesHead } from "./file-watcher";
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
import { PendingDeleteRegistry } from "./pending-delete-registry";
import { captureImportPlan } from "./import-plan";
import { withoutStoredEchoes } from "./stored-echoes";
import type { DirectoryImportPlan } from "../types/jobs";
import { isDocumentSidecarFile } from "./document-file-utils";
import {
  ensureDirectoryEntityStructure,
  getDirectoryMarkdownFiles,
} from "./directory-files";
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
  private entityService: ServiceEntityMirrorClient;
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
  private readonly guard: SyncGuard;
  private jobQueueCallback?:
    ((job: JobRequest) => Promise<string | undefined>) | undefined;
  private readonly pendingDeletes: PendingDeleteRegistry;
  private cleanupAdmission: (() => Promise<void>) | undefined;

  constructor(
    options: DirectorySyncOptions,
    pendingDeletes: PendingDeleteRegistry = new PendingDeleteRegistry(),
  ) {
    const normalizedOptions = normalizeDirectorySyncOptions(options);

    this.entityService = options.entityService;
    this.logger = options.logger.child("DirectorySync");
    this.pendingDeletes = pendingDeletes;

    this.syncPath = normalizedOptions.syncPath;

    this.autoSync = normalizedOptions.autoSync;
    this.watchInterval = normalizedOptions.watchInterval;
    this.deleteOnFileRemoval = normalizedOptions.deleteOnFileRemoval;
    this.entityTypes = normalizedOptions.entityTypes;

    const dependencies = createDirectorySyncDependencies(
      this.logger,
      this.entityService,
      this.syncPath,
      this.deleteOnFileRemoval,
    );
    this.fileOperations = dependencies.fileOperations;
    this.batchQueue = dependencies.batchQueue;
    this.progressOperations = dependencies.progressOperations;
    this.guard = new SyncGuard({
      entityService: this.entityService,
      fileOperations: this.fileOperations,
      syncPath: this.syncPath,
      conflicts: options.conflicts,
      importPaths: (paths): Promise<unknown> =>
        this.importEntitiesUnbatched(paths),
    });
    this.operationDeps = createDirectoryOperationDeps(
      this.logger,
      this.entityService,
      this.syncPath,
      dependencies,
      {
        maxImportFileBytes: normalizedOptions.maxImportFileBytes,
        maxAssetImportBytes: normalizedOptions.maxAssetImportBytes,
      },
      this.pendingDeletes,
      (): ((job: JobRequest) => Promise<string | undefined>) | undefined =>
        this.jobQueueCallback,
      options.conflicts,
      this.guard,
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

  setJobQueueCallback(
    callback: (job: JobRequest) => Promise<string | undefined>,
  ): void {
    this.jobQueueCallback = callback;
  }

  setCleanupAdmission(callback: () => Promise<void>): void {
    this.cleanupAdmission = callback;
  }

  /**
   * Sync entities from directory to database.
   *
   * NOTE: This method only imports (files -> DB). Export (DB -> files) is handled
   * by entity:created/entity:updated subscribers when autoSync is enabled.
   */
  async sync(): Promise<SyncResult> {
    return this.runBulkMutation("sync", () =>
      runDirectorySync({
        logger: this.logger,
        importEntities: this.importEntitiesUnbatched.bind(this),
        removeOrphanedEntities: this.removeOrphanedEntitiesUnbatched.bind(this),
        markSynced: (syncedAt) => {
          this.lastSync = syncedAt;
        },
      }),
    );
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
    projectionBatch?: DirectoryProjectionBatchRef,
    plan?: DirectoryImportPlan,
  ): Promise<ImportResult> {
    return this.runBulkMutation(
      "import",
      async () => {
        const selectedPaths =
          paths ?? (await this.fileOperations.getAllSyncFiles());
        const admitted =
          plan ??
          (await captureImportPlan(
            this.entityService,
            this.fileOperations,
            selectedPaths,
          ));
        return importDirectoryEntitiesWithProgress(
          this.progressOperations,
          selectedPaths,
          reporter,
          batchSize,
          (batch) => this.importEntitiesUnbatched(batch, admitted),
        );
      },
      projectionBatch,
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

  async importEntities(
    paths?: string[],
    projectionBatch?: DirectoryProjectionBatchRef,
  ): Promise<ImportResult> {
    return this.runBulkMutation(
      "import",
      () => this.importEntitiesUnbatched(paths),
      projectionBatch,
    );
  }

  async removeOrphanedEntities(
    projectionBatch?: DirectoryProjectionBatchRef,
  ): Promise<CleanupResult> {
    return this.runBulkMutation(
      "cleanup",
      () => this.removeOrphanedEntitiesUnbatched(),
      projectionBatch,
    );
  }

  private importEntitiesUnbatched(
    paths?: string[],
    plan?: DirectoryImportPlan,
  ): Promise<ImportResult> {
    return importDirectoryEntities(
      this.operationDeps,
      this.entityTypes,
      paths,
      plan,
    );
  }

  private async removeOrphanedEntitiesUnbatched(): Promise<CleanupResult> {
    await this.cleanupAdmission?.();
    return removeOrphanedDirectoryEntities(
      this.operationDeps,
      this.logger,
      this.deleteOnFileRemoval,
      this.entityTypes,
    );
  }

  private runBulkMutation<TResult>(
    operation: string,
    mutation: () => Promise<TResult>,
    projectionBatch?: DirectoryProjectionBatchRef,
  ): Promise<TResult> {
    // Durable job handlers already entered this root's scope. Reuse its
    // identity so the coordinator can join it without weakening its fence.
    return this.entityService.runBulkMutation(
      {
        source: "directory-sync",
        operationId:
          projectionBatch?.operationId ?? `${operation}:${createId()}`,
      },
      mutation,
    );
  }

  /** Write an entity's file, keeping an edit the file holds as a conflict. */
  writeEntityFile(entity: BaseEntity): Promise<void> {
    // A type kept out of the content repo is never written to it.
    if (this.operationDeps.keptOutOfRepo(entity.entityType)) {
      return Promise.resolve();
    }
    return this.guard.writeEntityFile(entity);
  }

  /** Keep the remote texts a pull did not take as conflicts. */
  recordPullConflicts(conflicts: PullConflict[]): Promise<string[]> {
    return this.guard.recordPullConflicts(conflicts);
  }

  /** Remove the files, and the recorded version, of an entity that is gone. */
  removeEntityFiles(entityType: string, id: string): Promise<void> {
    return this.guard.removeEntityFiles(entityType, id);
  }

  /** Delete the entity of a removed file unless it changed since they agreed. */
  deleteForRemovedFile(
    entityType: string,
    id: string,
  ): Promise<RemovedFileOutcome> {
    return this.guard.deleteForRemovedFile(entityType, id);
  }

  get fileOps(): FileOperations {
    return this.fileOperations;
  }

  get shouldDeleteOnFileRemoval(): boolean {
    return this.deleteOnFileRemoval;
  }

  async getAllMarkdownFiles(): Promise<string[]> {
    return getDirectoryMarkdownFiles(this.fileOperations);
  }

  async ensureDirectoryStructure(): Promise<void> {
    await ensureDirectoryEntityStructure(
      this.fileOperations,
      this.entityService,
      this.entityTypes,
    );
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
    pluginContext: DirectorySyncCore,
    source: string,
    metadata?: BatchMetadata,
    paths?: string[],
    deletedPaths?: string[],
  ): Promise<BatchResult | null> {
    return this.batchQueue.queueSyncBatch(
      pluginContext,
      source,
      metadata,
      paths,
      deletedPaths,
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

  async stopWatching(): Promise<void> {
    const fileWatcher = this.fileWatcher;
    this.fileWatcher = undefined;
    await stopDirectoryWatcher(fileWatcher);
  }

  suppressWatchPaths(paths: string[]): void {
    this.fileWatcher?.suppressPaths(paths);
  }

  ignorePulledWatchPaths(paths: string[], matchesHead: MatchesHead): void {
    this.fileWatcher?.ignorePulledPaths(paths, matchesHead);
  }

  withoutStoredEchoes(paths: string[]): Promise<string[]> {
    return withoutStoredEchoes(
      {
        syncPath: this.syncPath,
        entityService: this.entityService,
        fileOperations: this.fileOperations,
      },
      paths,
    );
  }

  async recordPendingPullDeletes(paths: string[]): Promise<void> {
    if (!this.deleteOnFileRemoval) return;

    for (const path of paths) {
      const target = this.fileOperations.getPendingDeleteTarget(path);
      if (!target) continue;
      if (
        isDocumentSidecarFile(path) &&
        (await this.fileOperations.fileExists(target.filePath))
      ) {
        continue;
      }
      this.pendingDeletes.record(target);
    }
  }

  isPendingDelete(entityType: string, entityId: string): boolean {
    return this.pendingDeletes.has(entityType, entityId);
  }

  completePendingDelete(
    entityType: string,
    entityId: string,
    filePath: string,
  ): void {
    const target = this.fileOperations.getPendingDeleteTarget(filePath);
    if (target?.entityType !== entityType || target.entityId !== entityId) {
      return;
    }
    this.pendingDeletes.complete(entityType, entityId, target.filePath);
  }

  setWatchCallback(callback: (event: string, path: string) => void): void {
    setDirectoryWatchCallback(this.fileWatcher, callback);
  }
}
