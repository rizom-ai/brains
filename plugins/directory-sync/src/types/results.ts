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
 * Cleanup result
 */
export interface CleanupResult {
  deleted: number;
  errors: Array<{
    entityId: string;
    entityType: string;
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
 * A single entry from git log for a file
 */
export interface GitLogEntry {
  sha: string;
  date: string;
  message: string;
}
