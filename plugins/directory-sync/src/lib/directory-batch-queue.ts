import type { ServicePluginContext } from "@brains/plugins";
import type { Logger } from "@brains/utils/logger";
import type {
  BatchMetadata,
  BatchResult,
  DirectoryDeleteTarget,
} from "../types";
import { BatchOperationsManager } from "./batch-operations";
import {
  DOCUMENT_SIDECAR_SUFFIX,
  isDocumentSidecarFile,
} from "./document-file-utils";
import type { FileOperations } from "./file-operations";
import { resolveInSyncPath, toSyncRelativePath } from "./path-utils";

export interface DirectoryBatchQueueOptions {
  logger: Logger;
  syncPath: string;
  fileOperations: FileOperations;
  deleteOnFileRemoval: boolean;
}

export class DirectoryBatchQueue {
  /** The discovery-and-enqueue in progress; the next one waits for it. */
  private queueTail: Promise<unknown> = Promise.resolve();
  private readonly syncPath: string;
  private readonly fileOperations: FileOperations;
  private readonly batchOperationsManager: BatchOperationsManager;

  constructor(options: DirectoryBatchQueueOptions) {
    this.syncPath = options.syncPath;
    this.fileOperations = options.fileOperations;
    this.batchOperationsManager = new BatchOperationsManager({
      logger: options.logger,
      syncPath: options.syncPath,
      deleteOnFileRemoval: options.deleteOnFileRemoval,
    });
  }

  /**
   * Discover and enqueue one batch. Calls run one at a time: a call made
   * while another is enqueueing waits and then queues its own batch. Dropping
   * it instead made startup report "No files to import" as a success.
   */
  queueSyncBatch(
    pluginContext: ServicePluginContext,
    source: string,
    metadata?: BatchMetadata,
    paths?: string[],
    deletedPaths?: string[],
  ): Promise<BatchResult | null> {
    const queued = this.queueTail.then(() =>
      this.queueNow(pluginContext, source, metadata, paths, deletedPaths),
    );
    // A failed call must not fail the ones queued behind it.
    this.queueTail = queued.catch(() => undefined);
    return queued;
  }

  private async queueNow(
    pluginContext: ServicePluginContext,
    source: string,
    metadata?: BatchMetadata,
    paths?: string[],
    deletedPaths?: string[],
  ): Promise<BatchResult | null> {
    const allFiles = await this.fileOperations.getAllSyncFiles();
    const selection = paths
      ? await this.selectChangedFiles(allFiles, paths, deletedPaths ?? [])
      : { files: allFiles, includeCleanup: true, deletions: [] };

    return this.batchOperationsManager.queueSyncBatch(
      pluginContext,
      source,
      selection.files,
      metadata,
      selection.includeCleanup,
      selection.deletions,
    );
  }

  private async selectChangedFiles(
    allFiles: string[],
    paths: string[],
    deletedPaths: string[],
  ): Promise<{
    files: string[];
    includeCleanup: boolean;
    deletions: DirectoryDeleteTarget[];
  }> {
    const requestedPaths = new Set(
      paths.map((path) => this.normalizePath(path)),
    );
    const deletedEntityPaths = new Set(
      deletedPaths
        .filter(
          (path) =>
            !isDocumentSidecarFile(toSyncRelativePath(this.syncPath, path)),
        )
        .map((path) => this.normalizePath(path)),
    );
    const requestedDeletions = new Set(deletedEntityPaths);
    for (const path of deletedPaths) {
      const relativePath = toSyncRelativePath(this.syncPath, path);
      if (!isDocumentSidecarFile(relativePath)) continue;
      const entityPath = this.normalizePath(path);
      if (
        deletedEntityPaths.has(entityPath) ||
        !(await this.fileOperations.fileExists(
          resolveInSyncPath(this.syncPath, entityPath),
        ))
      ) {
        requestedDeletions.add(entityPath);
      }
    }
    const files = allFiles.filter((path) => {
      const relativePath = toSyncRelativePath(this.syncPath, path);
      return (
        requestedPaths.has(relativePath) &&
        !requestedDeletions.has(relativePath)
      );
    });

    const deletions: DirectoryDeleteTarget[] = [];
    for (const path of requestedPaths) {
      if (
        !requestedDeletions.has(path) &&
        (await this.fileOperations.fileExists(
          resolveInSyncPath(this.syncPath, path),
        ))
      ) {
        continue;
      }
      const target = this.fileOperations.getPendingDeleteTarget(path);
      if (target) deletions.push(target);
    }

    return { files, includeCleanup: false, deletions };
  }

  private normalizePath(path: string): string {
    const relativePath = toSyncRelativePath(this.syncPath, path);
    return isDocumentSidecarFile(relativePath)
      ? relativePath.slice(0, -DOCUMENT_SIDECAR_SUFFIX.length)
      : relativePath;
  }
}
