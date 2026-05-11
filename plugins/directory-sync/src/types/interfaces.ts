import type { BaseEntity, ServicePluginContext } from "@brains/plugins";
import type { ProgressReporter } from "@brains/utils";
import type { BatchMetadata } from "./batch";
import type {
  CleanupResult,
  DirectorySyncStatus,
  ExportResult,
  GitLogEntry,
  GitSyncStatus,
  ImportResult,
  PullResult,
  RawEntity,
} from "./results";
import type { JobRequest } from "./jobs";

/**
 * Interface for file operations used by handlers
 * Allows mocking in tests without depending on the concrete FileOperations class
 */
export interface IFileOperations {
  readEntity(filePath: string): Promise<RawEntity>;
  parseEntityFromPath(filePath: string): { entityType: string; id: string };
}

/**
 * Interface for DirectorySync — all public methods.
 * Consumers accept this instead of the class, enabling clean test mocks.
 */
export interface IDirectorySync {
  initialize(): Promise<void>;
  initializeDirectory(): Promise<void>;
  setJobQueueCallback(callback: (job: JobRequest) => Promise<string>): void;
  sync(): Promise<{
    export: ExportResult;
    import: ImportResult;
    duration: number;
  }>;
  processEntityExport(entity: BaseEntity): Promise<{
    success: boolean;
    deleted?: boolean;
    error?: string;
  }>;
  exportEntities(entityTypes?: string[]): Promise<ExportResult>;
  importEntitiesWithProgress(
    paths: string[] | undefined,
    reporter: ProgressReporter,
    batchSize: number,
  ): Promise<ImportResult>;
  exportEntitiesWithProgress(
    entityTypes: string[] | undefined,
    reporter: ProgressReporter,
    batchSize: number,
  ): Promise<ExportResult>;
  importEntities(paths?: string[]): Promise<ImportResult>;
  removeOrphanedEntities(): Promise<CleanupResult>;
  readonly fileOps: IFileOperations;
  readonly shouldDeleteOnFileRemoval: boolean;
  getAllMarkdownFiles(): Promise<string[]>;
  ensureDirectoryStructure(): Promise<void>;
  getStatus(): Promise<DirectorySyncStatus>;
  queueSyncBatch(
    pluginContext: ServicePluginContext,
    source: string,
    metadata?: BatchMetadata,
  ): Promise<{
    batchId: string;
    operationCount: number;
    exportOperationsCount: number;
    importOperationsCount: number;
    totalFiles: number;
  } | null>;
  startWatching(): Promise<void>;
  stopWatching(): void;
  setWatchCallback(callback: (event: string, path: string) => void): void;
}

/**
 * Interface for GitSync — all public methods.
 * Consumers accept this instead of the class, enabling clean test mocks.
 */
export interface IGitSync {
  withLock<T>(fn: () => Promise<T>): Promise<T>;
  initialize(): Promise<void>;
  hasRemote(): boolean;
  getStatus(): Promise<GitSyncStatus>;
  hasLocalChanges(): Promise<boolean>;
  commit(message?: string): Promise<void>;
  push(): Promise<void>;
  pull(): Promise<PullResult>;
  cleanup(): void;

  /** Get commit history for a specific file path (relative to data dir) */
  log(filePath: string, limit?: number): Promise<GitLogEntry[]>;
  /** Get file content at a specific commit */
  show(sha: string, filePath: string): Promise<string>;
}
