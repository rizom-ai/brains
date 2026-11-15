import type { BatchOperation } from "@brains/sdk/internal/service-runtime";

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
