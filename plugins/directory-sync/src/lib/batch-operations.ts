import type { BatchOperation, ServicePluginContext } from "@brains/plugins";
import type { Logger } from "@brains/utils/logger";
import { createId } from "@brains/plugins";
import type {
  BatchMetadata,
  BatchOperationResult,
  BatchResult,
  DirectoryDeleteTarget,
} from "../types";

export type {
  BatchMetadata,
  BatchOperationResult,
  BatchResult,
} from "../types";

export interface BatchOperationsManagerOptions {
  logger: Logger;
  syncPath: string;
  deleteOnFileRemoval: boolean;
}

export class BatchOperationsManager {
  private readonly logger: Logger;
  private readonly syncPath: string;
  private readonly deleteOnFileRemoval: boolean;

  constructor(options: BatchOperationsManagerOptions) {
    this.logger = options.logger;
    this.syncPath = options.syncPath;
    this.deleteOnFileRemoval = options.deleteOnFileRemoval;
  }

  /**
   * Prepare batch operations for sync.
   *
   * Only creates import operations (file→DB). Export (DB→file) is handled
   * by auto-sync's entity:created/entity:updated subscribers — batch export
   * would overwrite user edits with stale DB content before imports run.
   */
  prepareBatchOperations(
    files: string[],
    includeCleanup: boolean = true,
    deletions: DirectoryDeleteTarget[] = [],
  ): BatchOperationResult {
    const operations: BatchOperation[] = [];

    const importOps = this.createImportOperations(files);
    operations.push(...importOps);
    const importOperationsCount = importOps.length;

    if (this.deleteOnFileRemoval) {
      operations.push(...this.createDeleteOperations(deletions));

      if (includeCleanup) {
        operations.push({ type: "directory-cleanup", data: {} });
      }
    }

    const totalFiles = files.length;

    this.logger.debug("Prepared batch operations", {
      exportOperationsCount: 0,
      importOperationsCount,
      totalFiles,
    });

    return {
      operations,
      exportOperationsCount: 0,
      importOperationsCount,
      totalFiles,
    };
  }

  async queueSyncBatch(
    pluginContext: ServicePluginContext,
    source: string,
    files: string[],
    metadata?: BatchMetadata,
    includeCleanup: boolean = true,
    deletions: DirectoryDeleteTarget[] = [],
  ): Promise<BatchResult | null> {
    const batchData = this.prepareBatchOperations(
      files,
      includeCleanup,
      deletions,
    );

    if (batchData.operations.length === 0) {
      this.logger.debug("No sync operations needed", { source });
      return null;
    }

    const rootJobId = createId();
    const expectedChildren = batchData.operations.length;
    const operations = batchData.operations.map((operation, index) => ({
      ...operation,
      data: {
        ...operation.data,
        projectionBatch: {
          operationId: rootJobId,
          rootJobId,
          childKey: `${index}:${operation.type}`,
          expectedChildren,
        },
      },
    }));
    const coordinator = pluginContext.bulkMutations;
    await coordinator.prepareDurableBulkMutation({
      source: "directory-sync",
      operationId: rootJobId,
      rootJobId,
      expectedChildren,
    });
    let batchId: string;
    try {
      batchId = await pluginContext.jobs.enqueueBatch(operations, {
        source,
        rootJobId,
        metadata: {
          progressToken: metadata?.progressToken,
          operationType: "file_operations",
          operationTarget: this.syncPath,
          pluginId: metadata?.pluginId ?? "directory-sync",
          // Routing context for progress messages
          interfaceType: metadata?.interfaceType,
          channelId: metadata?.channelId,
        },
      });
      await coordinator.finalizeDurableBulkMutationEnqueue(rootJobId);
    } catch (error) {
      try {
        await coordinator.failDurableBulkMutationEnqueue(rootJobId);
      } catch (markerError) {
        this.logger.error(
          "Failed to record durable projection batch enqueue failure",
          { rootJobId, error: markerError },
        );
      }
      throw error;
    }

    return {
      batchId,
      operationCount: batchData.operations.length,
      exportOperationsCount: batchData.exportOperationsCount,
      importOperationsCount: batchData.importOperationsCount,
      totalFiles: batchData.totalFiles,
    };
  }

  private createDeleteOperations(
    deletions: DirectoryDeleteTarget[],
  ): BatchOperation[] {
    const batchSize = 50;
    const operations: BatchOperation[] = [];

    for (let index = 0; index < deletions.length; index += batchSize) {
      const batch = deletions.slice(index, index + batchSize);
      const target = batch[0];
      if (!target) continue;
      operations.push({
        type: "directory-delete",
        data:
          batch.length === 1
            ? {
                entityId: target.entityId,
                entityType: target.entityType,
                filePath: target.filePath,
              }
            : { deletions: batch },
      });
    }

    return operations;
  }

  private createImportOperations(files: string[]): BatchOperation[] {
    if (files.length === 0) {
      return [];
    }

    const batchSize = 50;
    const operations: BatchOperation[] = [];

    for (let i = 0; i < files.length; i += batchSize) {
      const batch = files.slice(i, i + batchSize);
      operations.push({
        type: "directory-import",
        data: {
          batchIndex: Math.floor(i / batchSize),
          paths: batch,
          batchSize: batch.length,
        },
      });
    }

    return operations;
  }
}
