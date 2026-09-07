import type { DirectorySyncHost } from "../host";
import { createId } from "@brains/utils/id";
import type { Logger } from "@brains/utils/logger";
import type {
  BatchMetadata,
  BatchOperationResult,
  BatchResult,
  DirectoryBatchOperation,
  DirectoryDeleteTarget,
} from "../types";
import { jobDefinitionFor } from "../jobs";

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
    const operations: DirectoryBatchOperation[] = [];

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
    pluginContext: Pick<DirectorySyncHost, "jobs" | "mirror">,
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
    const batch =
      await pluginContext.mirror.coordination.beginDurableBulkMutation({
        rootJobId,
        expectedChildren: batchData.operations.length,
      });
    const operations = batchData.operations.map((operation, index) => ({
      ...operation,
      data: {
        ...operation.data,
        projectionBatch: batch.childRef(`${index}:${operation.type}`),
      },
    }));
    let batchId: string;
    try {
      // The runtime files these under this package's id and scopes the
      // names; the root links them to the durable batch begun above.
      const queued = await pluginContext.jobs.enqueueBatch(
        operations.map((operation) => ({
          definition: jobDefinitionFor(operation.type),
          input: operation.data,
        })),
        {
          rootJobId,
          ...(metadata?.progressToken !== undefined
            ? { progressToken: metadata.progressToken }
            : {}),
          operationTarget: this.syncPath,
        },
      );
      batchId = queued.id;
      await batch.seal();
    } catch (error) {
      try {
        await batch.abort();
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
  ): DirectoryBatchOperation[] {
    const batchSize = 50;
    const operations: DirectoryBatchOperation[] = [];

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

  private createImportOperations(files: string[]): DirectoryBatchOperation[] {
    if (files.length === 0) {
      return [];
    }

    const batchSize = 50;
    const operations: DirectoryBatchOperation[] = [];

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
