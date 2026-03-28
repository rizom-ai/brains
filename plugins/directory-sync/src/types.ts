import { z } from "@brains/utils";
import type { BaseEntity, ServicePluginContext } from "@brains/plugins";
import type { ProgressReporter } from "@brains/utils";
import type { GitSyncStatus, PullResult } from "./lib/git-sync";
import type { BatchMetadata } from "./lib/batch-operations";
import type { CleanupResult } from "./lib/cleanup-pipeline";

/**
 * Configuration schema for directory sync plugin
 */
export const directorySyncConfigSchema = z.object({
  syncPath: z
    .string()
    .optional()
    .describe(
      "Optional override for sync directory (defaults to shell dataDir)",
    ),
  autoSync: z
    .boolean()
    .describe("Enable bidirectional auto-sync")
    .default(true),
  watchInterval: z
    .number()
    .describe("File watch polling interval in ms")
    .default(1000),
  includeMetadata: z
    .boolean()
    .describe("Include frontmatter metadata")
    .default(true),
  entityTypes: z
    .array(z.string())
    .optional()
    .describe("Specific entity types to sync"),
  initialSync: z
    .boolean()
    .optional()
    .describe("Queue initial sync job on startup")
    .default(true),
  initialSyncDelay: z
    .number()
    .optional()
    .describe("Delay before initial sync (ms)")
    .default(1000),
  syncBatchSize: z
    .number()
    .optional()
    .describe("Batch size for sync operations")
    .default(10),
  syncPriority: z
    .number()
    .min(1)
    .max(10)
    .optional()
    .describe("Job priority (1-10)")
    .default(3),
  seedContent: z
    .boolean()
    .optional()
    .describe("Copy seed content on first initialization")
    .default(true),
  seedContentPath: z
    .string()
    .optional()
    .describe(
      "Custom path to seed content directory (defaults to CWD/seed-content)",
    ),
  deleteOnFileRemoval: z
    .boolean()
    .optional()
    .describe("Delete entities from database when files are deleted")
    .default(true),
  syncInterval: z
    .number()
    .min(1)
    .optional()
    .describe("Pull/push interval in minutes (requires git)")
    .default(2),
  commitDebounce: z
    .number()
    .min(100)
    .optional()
    .describe("Debounce delay in ms before git commit after entity changes")
    .default(5000),

  git: z
    .object({
      repo: z.string().optional().describe("GitHub repo (owner/name)"),
      gitUrl: z
        .string()
        .optional()
        .describe("Full git remote URL (overrides repo)"),
      branch: z.string().default("main").describe("Git branch to sync"),
      authToken: z.string().optional().describe("Auth token for private repos"),
      authorName: z.string().optional().describe("Git commit author name"),
      authorEmail: z.string().optional().describe("Git commit author email"),
    })
    .optional(),
});

export type DirectorySyncConfig = z.infer<typeof directorySyncConfigSchema>;

/**
 * Directory sync status
 */
export interface DirectorySyncStatus {
  syncPath: string;
  exists: boolean;
  watching: boolean;
  lastSync?: Date | undefined;
  files: Array<{
    path: string;
    entityType: string;
    modified: Date;
  }>;
  stats: {
    totalFiles: number;
    byEntityType: Record<string, number>;
  };
}

/**
 * Export result
 */
export interface ExportResult {
  exported: number;
  failed: number;
  errors: Array<{
    entityId: string;
    entityType: string;
    error: string;
  }>;
}

/**
 * Import result
 */
export interface ImportResult {
  imported: number;
  skipped: number;
  failed: number;
  quarantined: number;
  quarantinedFiles: string[];
  errors: Array<{
    path: string;
    error: string;
  }>;
  jobIds: string[]; // Job IDs for async embedding generation
}

/**
 * Sync result combining import and export
 */
export interface SyncResult {
  export: ExportResult;
  import: ImportResult;
  duration: number;
}

/**
 * Delete result
 */
export interface DeleteResult {
  deleted: boolean;
  entityId: string;
  entityType: string;
  filePath: string;
}

/**
 * Raw entity data from file
 */
export interface RawEntity {
  entityType: string;
  id: string;
  content: string;
  created: Date;
  updated: Date;
}

/**
 * Schema for directory sync job data
 */
export const directorySyncJobSchema = z.object({
  operation: z.enum(["initial", "scheduled", "manual"]),
  paths: z.array(z.string()).optional(),
  entityTypes: z.array(z.string()).optional(),
  syncDirection: z.enum(["import", "export", "both"]).optional(),
});

export type DirectorySyncJobData = z.infer<typeof directorySyncJobSchema>;

/**
 * Schema for directory import job data
 */
export const directoryImportJobSchema = z.object({
  paths: z.array(z.string()).optional(),
  batchSize: z.number().min(1).optional(),
  batchIndex: z.number().optional(),
});

export type DirectoryImportJobData = z.infer<typeof directoryImportJobSchema>;

/**
 * Schema for directory export job data
 */
export const directoryExportJobSchema = z.object({
  entityTypes: z.array(z.string()).optional(),
  batchSize: z.number().min(1).optional(),
});

export type DirectoryExportJobData = z.infer<typeof directoryExportJobSchema>;

/**
 * Schema for directory delete job data
 */
export const directoryDeleteJobSchema = z.object({
  entityId: z.string(),
  entityType: z.string(),
  filePath: z.string(),
});

export type DirectoryDeleteJobData = z.infer<typeof directoryDeleteJobSchema>;

/**
 * Schema for cover image conversion job data
 */
export const coverImageConversionJobSchema = z.object({
  filePath: z.string(),
  sourceUrl: z.string().url(),
  postTitle: z.string(),
  postSlug: z.string(),
  customAlt: z.string().optional(),
});

export type CoverImageConversionJobData = z.infer<
  typeof coverImageConversionJobSchema
>;

/**
 * Schema for inline image conversion job data
 */
export const inlineImageConversionJobSchema = z.object({
  /** Path to the markdown file to update */
  filePath: z.string(),
  /** Slug of the post (used for generating image IDs) */
  postSlug: z.string(),
});

export type InlineImageConversionJobData = z.infer<
  typeof inlineImageConversionJobSchema
>;

/**
 * Job request types for file watcher - discriminated union for type safety
 */
export type JobRequest =
  | { type: "directory-sync"; data: DirectorySyncJobData }
  | { type: "directory-import"; data: DirectoryImportJobData }
  | { type: "directory-export"; data: DirectoryExportJobData }
  | { type: "directory-delete"; data: DirectoryDeleteJobData }
  | { type: "cover-image-convert"; data: CoverImageConversionJobData }
  | { type: "inline-image-convert"; data: InlineImageConversionJobData };

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
    options?: { includeCleanup?: boolean },
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
}
