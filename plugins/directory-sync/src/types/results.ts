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
 * Git sync status.
 */
export interface GitSyncStatus {
  isRepo: boolean;
  hasChanges: boolean;
  ahead: number;
  behind: number;
  branch: string;
  lastCommit?: string | undefined;
  remote?: string | undefined;
  files: Array<{ path: string; status: string }>;
}

/**
 * Pull result — files changed by the pull operation.
 */
export interface PullResult {
  files: string[];
  deletedFiles?: string[] | undefined;
}

/** Durable identity and commit boundary for checkout-to-database reconciliation. */
export interface GitReconciliationCheckpoint {
  /** SHA-256 of the credential-free configured remote URL. */
  remoteFingerprint: string;
  branch: string;
  lastReconciledGitHead: string;
  /** Remote-tracking head used to distinguish authoritative remote deletions. */
  lastObservedRemoteHead?: string | undefined;
}

export type GitReconciliationFallbackReason =
  | "missing-checkpoint"
  | "repository-identity-mismatch"
  | "branch-mismatch"
  | "missing-local-checkpoint"
  | "non-ancestor-local-checkpoint"
  | "remote-checkpoint-mismatch";

/** Changed checkout paths since the durable checkpoint, or a safe full-scan fallback. */
export type GitReconciliationDelta =
  | {
      mode: "incremental";
      checkpoint: GitReconciliationCheckpoint;
      files: string[];
      /** Only deletions observed on the remote-tracking branch. */
      deletedFiles: string[];
    }
  | {
      mode: "full";
      checkpoint: GitReconciliationCheckpoint;
      reason: GitReconciliationFallbackReason;
    };

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
  // Optional so queued results created before this field was introduced still parse.
  issues?:
    | Array<{
        path: string;
        message: string;
      }>
    | undefined;
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

export type DirectoryDeleteJobResult = DeleteResult | DeleteResult[];

/**
 * Raw entity data from file.
 *
 * `metadata` carries fields the entity adapter cannot recover from `content`
 * alone — currently used for document sidecar metadata (filename, page count,
 * dedup key, etc.) and a path-derived filename fallback for documents.
 */
export interface RawEntity {
  entityType: string;
  id: string;
  content: string;
  created: Date;
  updated: Date;
  metadata?: Record<string, unknown>;
}

/**
 * A single entry from git log for a file
 */
export interface GitLogEntry {
  sha: string;
  date: string;
  message: string;
}
