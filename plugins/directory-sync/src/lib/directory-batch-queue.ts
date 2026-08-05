import type { ServicePluginContext } from "@brains/plugins";
import type { Logger } from "@brains/utils/logger";
import type { BatchMetadata, BatchResult } from "../types";
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
  ): Promise<BatchResult | null> {
    if (this.syncInProgress) {
      this.logger.debug("Sync already in progress, skipping", { source });
      return null;
    }

    this.syncInProgress = true;
    try {
      const allFiles = await this.fileOperations.getAllSyncFiles();
      const selection = paths
        ? await this.selectChangedFiles(allFiles, paths)
        : { files: allFiles, includeCleanup: true };

      return await this.batchOperationsManager.queueSyncBatch(
        pluginContext,
        source,
        selection.files,
        metadata,
        selection.includeCleanup,
      );
    } finally {
      this.syncInProgress = false;
    }
  }

  private async selectChangedFiles(
    allFiles: string[],
    paths: string[],
  ): Promise<{ files: string[]; includeCleanup: boolean }> {
    const requestedPaths = new Set(
      paths.map((path) => this.normalizePath(path)),
    );
    const files = allFiles.filter((path) =>
      requestedPaths.has(toSyncRelativePath(this.syncPath, path)),
    );

    let includeCleanup = false;
    for (const path of requestedPaths) {
      if (
        !(await this.fileOperations.fileExists(
          resolveInSyncPath(this.syncPath, path),
        ))
      ) {
        includeCleanup = true;
        break;
      }
    }

    return { files, includeCleanup };
  }

  private normalizePath(path: string): string {
    const relativePath = toSyncRelativePath(this.syncPath, path);
    return isDocumentSidecarFile(relativePath)
      ? relativePath.slice(0, -DOCUMENT_SIDECAR_SUFFIX.length)
      : relativePath;
  }
}
