import { z } from "zod";

/**
 * Configuration schema for directory sync plugin
 */
export const directorySyncConfigSchema = z.object({
  syncPath: z.string().describe("Directory path for synchronization"),
  watchEnabled: z.boolean().describe("Enable file watching"),
  watchInterval: z.number().describe("Watch polling interval in ms"),
  includeMetadata: z.boolean().describe("Include frontmatter metadata"),
  entityTypes: z
    .array(z.string())
    .optional()
    .describe("Specific entity types to sync"),
});

export type DirectorySyncConfig = z.infer<typeof directorySyncConfigSchema>;
export type DirectorySyncConfigInput = z.input<
  typeof directorySyncConfigSchema
>;

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
