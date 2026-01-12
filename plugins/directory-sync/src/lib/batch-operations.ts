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
   * Prepare batch operations for sync
   * Returns the operations needed without executing them
   */
  prepareBatchOperations(
    entityTypes: string[],
    files: string[],
  ): BatchOperationResult {
    const operations: BatchOperation[] = [];
    let exportOperationsCount = 0;
    let importOperationsCount = 0;

    // Create export operations for each entity type
    const exportOps = this.createExportOperations(entityTypes);
    operations.push(...exportOps);
    exportOperationsCount = exportOps.length;

    // Create import operations for files
    const importOps = this.createImportOperations(files);
    operations.push(...importOps);
    importOperationsCount = importOps.length;

    const totalFiles = files.length;

    this.logger.debug("Prepared batch operations", {
      exportOperationsCount,
      importOperationsCount,
      totalFiles,
    });

    return {
      operations,
      exportOperationsCount,
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
    entityTypes: string[],
    files: string[],
    metadata?: BatchMetadata,
  ): Promise<BatchResult | null> {
    const batchData = this.prepareBatchOperations(entityTypes, files);

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
   * Create export operations for entity types
   */
  private createExportOperations(entityTypes: string[]): BatchOperation[] {
    if (entityTypes.length === 0) {
      return [];
    }

    // Export operations - process each entity type as a separate batch
    return entityTypes.map((entityType) => ({
      type: "directory-export",
      data: {
        entityTypes: [entityType],
        batchSize: 100,
      },
    }));
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
