import type { DirectorySyncJobType } from "./jobs";

/** One job a sweep files: which declared job, and what it runs on. */
export interface DirectoryBatchOperation {
  type: DirectorySyncJobType;
  data: Record<string, unknown>;
}

export interface BatchOperationResult {
  operations: DirectoryBatchOperation[];
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
