import { z } from "@brains/utils";
import type { ProgressReporter, BaseEntity } from "@brains/plugins";

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
  syncDebounce: z
    .number()
    .describe("Debounce time for entity exports in ms")
    .default(1000),
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
  deleteOnFileRemoval: z
    .boolean()
    .optional()
    .describe("Delete entities from database when files are deleted")
    .default(true),
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
 * Interface for DirectorySync used by job handlers
 * Allows mocking in tests without depending on the concrete DirectorySync class
 */
export interface IDirectorySync {
  /** Import entities from directory with progress reporting */
  importEntitiesWithProgress(
    paths: string[] | undefined,
    reporter: ProgressReporter,
    batchSize: number,
  ): Promise<ImportResult>;

  /** Export entities to directory with progress reporting */
  exportEntitiesWithProgress(
    entityTypes: string[] | undefined,
    reporter: ProgressReporter,
    batchSize: number,
  ): Promise<ExportResult>;

  /** Get all markdown files in the sync directory */
  getAllMarkdownFiles(): string[];

  /** Process export for a single entity */
  processEntityExport(entity: BaseEntity): Promise<{
    success: boolean;
    deleted?: boolean;
    error?: string;
  }>;

  /** File operations for reading/writing entities */
  readonly fileOps: IFileOperations;
}
