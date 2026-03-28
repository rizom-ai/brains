import type { ServicePluginContext, BatchOperation } from "@brains/plugins";
import type { Logger } from "@brains/utils";
import { createId } from "@brains/plugins";

export interface BatchOperationResult {
  operations: BatchOperation[];
  exportOperationsCount: number;
  importOperationsCount: number;
  totalFiles: number;
}

export interface BatchMetadata {
  progressToken?: string | undefined;
  pluginId?: string | undefined;
  rootJobId?: string | undefined;
  // Routing context for progress messages
  interfaceType?: string | undefined;
  channelId?: string | undefined;
}

export interface BatchResult {
  batchId: string;
  operationCount: number;
  exportOperationsCount: number;
  importOperationsCount: number;
  totalFiles: number;
}

/**
 * Manages batch operations for directory sync
 */
export class BatchOperationsManager {
  private readonly logger: Logger;
  private readonly syncPath: string;

  constructor(logger: Logger, syncPath: string) {
    this.logger = logger;
    this.syncPath = syncPath;
  }

  /**
   * Prepare batch operations for sync.
   *
   * Only creates import operations (file→DB). Export (DB→file) is handled
   * by auto-sync's entity:created/entity:updated subscribers — batch export
   * would overwrite user edits with stale DB content before imports run.
   */
  prepareBatchOperations(files: string[]): BatchOperationResult {
    if (files.length === 0) {
      return {
        operations: [],
        exportOperationsCount: 0,
        importOperationsCount: 0,
        totalFiles: 0,
      };
    }

    const operations: BatchOperation[] = [];

    const importOps = this.createImportOperations(files);
    operations.push(...importOps);
    const importOperationsCount = importOps.length;

    // Cleanup runs last — removes DB entities whose files no longer exist
    operations.push({ type: "directory-cleanup", data: {} });

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

  /**
   * Queue a sync batch operation
   * Encapsulates the common pattern of preparing and queuing batch operations
   */
  async queueSyncBatch(
    pluginContext: ServicePluginContext,
    source: string,
    files: string[],
    metadata?: BatchMetadata,
  ): Promise<BatchResult | null> {
    const batchData = this.prepareBatchOperations(files);

    if (batchData.operations.length === 0) {
      this.logger.debug("No sync operations needed", { source });
      return null;
    }

    const batchId = await pluginContext.jobs.enqueueBatch(
      batchData.operations,
      {
        source,
        rootJobId: metadata?.rootJobId ?? createId(),
        metadata: {
          progressToken: metadata?.progressToken,
          operationType: "file_operations",
          operationTarget: this.syncPath,
          pluginId: metadata?.pluginId ?? "directory-sync",
          // Routing context for progress messages
          interfaceType: metadata?.interfaceType,
          channelId: metadata?.channelId,
        },
      },
    );

    return {
      batchId,
      operationCount: batchData.operations.length,
      exportOperationsCount: batchData.exportOperationsCount,
      importOperationsCount: batchData.importOperationsCount,
      totalFiles: batchData.totalFiles,
    };
  }

  /**
   * Create import operations for files
   */
  private createImportOperations(files: string[]): BatchOperation[] {
    if (files.length === 0) {
      return [];
    }

    // Import operations - batch files for efficient processing
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
