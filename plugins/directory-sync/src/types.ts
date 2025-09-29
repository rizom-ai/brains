import { z } from "@brains/utils";

/**
 * Configuration schema for directory sync plugin
 */
export const directorySyncConfigSchema = z.object({
  syncPath: z
    .string()
    .describe("Directory path for synchronization")
    .default("./brain-data"),
  watchEnabled: z.boolean().describe("Enable file watching").default(true),
  watchInterval: z
    .number()
    .describe("Watch polling interval in ms")
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
    .default(false),
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
 * Job data for directory sync operations
 */
export interface DirectorySyncJobData {
  operation: "initial" | "scheduled" | "manual";
  paths?: string[];
  entityTypes?: string[];
  syncDirection?: "import" | "export" | "both";
}

/**
 * Job data for directory import operations
 */
export interface DirectoryImportJobData {
  paths?: string[];
  batchSize?: number;
  batchIndex?: number;
}

/**
 * Job data for directory export operations
 */
export interface DirectoryExportJobData {
  entityTypes?: string[];
  batchSize?: number;
}

/**
 * Job request types for file watcher - discriminated union for type safety
 */
export type JobRequest =
  | { type: "directory-sync"; data: DirectorySyncJobData }
  | { type: "directory-import"; data: DirectoryImportJobData }
  | { type: "directory-export"; data: DirectoryExportJobData };
