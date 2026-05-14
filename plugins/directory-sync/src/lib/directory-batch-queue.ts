import type { ServicePluginContext } from "@brains/plugins";
import type { Logger } from "@brains/utils";
import type { BatchMetadata, BatchResult } from "../types";
import { BatchOperationsManager } from "./batch-operations";
import type { FileOperations } from "./file-operations";

export class DirectoryBatchQueue {
  private syncInProgress = false;
  private readonly batchOperationsManager: BatchOperationsManager;

  constructor(
    private readonly logger: Logger,
    syncPath: string,
    private readonly fileOperations: FileOperations,
    deleteOnFileRemoval: boolean,
  ) {
    this.batchOperationsManager = new BatchOperationsManager(
      logger,
      syncPath,
      deleteOnFileRemoval,
    );
  }

  async queueSyncBatch(
    pluginContext: ServicePluginContext,
    source: string,
    metadata?: BatchMetadata,
  ): Promise<BatchResult | null> {
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
      );
    } finally {
      this.syncInProgress = false;
    }
  }
}
