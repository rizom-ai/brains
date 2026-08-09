import type { ServicePluginContext } from "@brains/plugins";
import type { Logger } from "@brains/utils/logger";
import type {
  BatchMetadata,
  BatchResult,
  DirectoryDeleteJobData,
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
  private syncInProgress = false;
  private readonly logger: Logger;
  private readonly syncPath: string;
  private readonly fileOperations: FileOperations;
  private readonly batchOperationsManager: BatchOperationsManager;

  constructor(options: DirectoryBatchQueueOptions) {
    this.logger = options.logger;
    this.syncPath = options.syncPath;
    this.fileOperations = options.fileOperations;
    this.batchOperationsManager = new BatchOperationsManager({
      logger: options.logger,
      syncPath: options.syncPath,
      deleteOnFileRemoval: options.deleteOnFileRemoval,
    });
  }

  async queueSyncBatch(
    pluginContext: ServicePluginContext,
    source: string,
    metadata?: BatchMetadata,
    paths?: string[],
    deletedPaths?: string[],
  ): Promise<BatchResult | null> {
    if (this.syncInProgress) {
      this.logger.debug("Sync already in progress, skipping", { source });
      return null;
    }

    this.syncInProgress = true;
    try {
      const allFiles = await this.fileOperations.getAllSyncFiles();
      const selection = paths
        ? await this.selectChangedFiles(allFiles, paths, deletedPaths ?? [])
        : { files: allFiles, includeCleanup: true, deletions: [] };

      return await this.batchOperationsManager.queueSyncBatch(
        pluginContext,
        source,
        selection.files,
        metadata,
        selection.includeCleanup,
        selection.deletions,
      );
    } finally {
      this.syncInProgress = false;
    }
  }

  private async selectChangedFiles(
    allFiles: string[],
    paths: string[],
    deletedPaths: string[],
  ): Promise<{
    files: string[];
    includeCleanup: boolean;
    deletions: DirectoryDeleteJobData[];
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

    const deletions: DirectoryDeleteJobData[] = [];
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
