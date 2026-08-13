import type { IDirectorySync, IFileOperations, IGitSync } from "../types";

/** Stable Promise facade that resolves the active directory generation per call. */
export function createDirectorySyncFacade(
  getActive: () => IDirectorySync,
): IDirectorySync {
  return {
    initialize: () => getActive().initialize(),
    initializeDirectory: () => getActive().initializeDirectory(),
    setJobQueueCallback: (callback) =>
      getActive().setJobQueueCallback(callback),
    sync: () => getActive().sync(),
    processEntityExport: (entity) => getActive().processEntityExport(entity),
    exportEntities: (entityTypes) => getActive().exportEntities(entityTypes),
    importEntitiesWithProgress: (paths, reporter, batchSize) =>
      getActive().importEntitiesWithProgress(paths, reporter, batchSize),
    exportEntitiesWithProgress: (entityTypes, reporter, batchSize) =>
      getActive().exportEntitiesWithProgress(entityTypes, reporter, batchSize),
    importEntities: (paths) => getActive().importEntities(paths),
    removeOrphanedEntities: () => getActive().removeOrphanedEntities(),
    get fileOps(): IFileOperations {
      return getActive().fileOps;
    },
    get shouldDeleteOnFileRemoval(): boolean {
      return getActive().shouldDeleteOnFileRemoval;
    },
    getAllMarkdownFiles: () => getActive().getAllMarkdownFiles(),
    ensureDirectoryStructure: () => getActive().ensureDirectoryStructure(),
    getStatus: () => getActive().getStatus(),
    queueSyncBatch: (context, source, metadata, paths, deletedPaths) =>
      getActive().queueSyncBatch(
        context,
        source,
        metadata,
        paths,
        deletedPaths,
      ),
    startWatching: () => getActive().startWatching(),
    stopWatching: () => getActive().stopWatching(),
    suppressWatchPaths: (paths) => getActive().suppressWatchPaths(paths),
    recordPendingPullDeletes: (paths) =>
      getActive().recordPendingPullDeletes(paths),
    isPendingDelete: (entityType, entityId) =>
      getActive().isPendingDelete(entityType, entityId),
    completePendingDelete: (entityType, entityId, filePath) =>
      getActive().completePendingDelete(entityType, entityId, filePath),
    setWatchCallback: (callback) => getActive().setWatchCallback(callback),
  };
}

/** Stable Promise facade that resolves the active Git generation per call. */
export function createGitSyncFacade(getActive: () => IGitSync): IGitSync {
  return {
    withLock: <T>(fn: () => Promise<T>, signal?: AbortSignal): Promise<T> =>
      getActive().withLock(fn, signal),
    initialize: () => getActive().initialize(),
    hasRemote: () => getActive().hasRemote(),
    getStatus: () => getActive().getStatus(),
    hasLocalChanges: () => getActive().hasLocalChanges(),
    commit: (message) => getActive().commit(message),
    push: (signal) => getActive().push(signal),
    pull: (signal) => getActive().pull(signal),
    getReconciliationDelta: (checkpoint) =>
      getActive().getReconciliationDelta(checkpoint),
    cleanup: () => getActive().cleanup(),
    log: (filePath, limit) => getActive().log(filePath, limit),
    show: (sha, filePath) => getActive().show(sha, filePath),
  };
}
