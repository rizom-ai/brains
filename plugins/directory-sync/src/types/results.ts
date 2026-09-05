import { z } from "@brains/utils/zod";

/**
 * Directory sync status
 */
export const directorySyncStatusSchema: z.ZodObject<{
  syncPath: z.ZodString;
  exists: z.ZodBoolean;
  watching: z.ZodBoolean;
  lastSync: z.ZodOptional<z.ZodDate>;
  files: z.ZodArray<
    z.ZodObject<{
      path: z.ZodString;
      entityType: z.ZodString;
      modified: z.ZodDate;
    }>
  >;
  stats: z.ZodObject<{
    totalFiles: z.ZodNumber;
    byEntityType: z.ZodRecord<z.ZodString, z.ZodNumber>;
  }>;
}> = z
  .object({
    syncPath: z.string(),
    exists: z.boolean(),
    watching: z.boolean(),
    lastSync: z.date().optional(),
    files: z.array(
      z.object({
        path: z.string(),
        entityType: z.string(),
        modified: z.date(),
      }),
    ),
    stats: z.object({
      totalFiles: z.number(),
      byEntityType: z.record(z.string(), z.number()),
    }),
  })
  .describe(
    "Directory synchronization status - use with directorySyncStatus formatter",
  );

export type DirectorySyncStatus = z.output<typeof directorySyncStatusSchema>;

/**
 * Git sync status.
 */
export const gitSyncStatusSchema: z.ZodObject<
  {
    isRepo: z.ZodBoolean;
    hasChanges: z.ZodBoolean;
    ahead: z.ZodNumber;
    behind: z.ZodNumber;
    branch: z.ZodString;
    lastCommit: z.ZodOptional<z.ZodString>;
    remote: z.ZodOptional<z.ZodString>;
    files: z.ZodArray<
      z.ZodObject<{ path: z.ZodString; status: z.ZodString }, z.core.$strict>
    >;
  },
  z.core.$strict
> = z.strictObject({
  isRepo: z.boolean(),
  hasChanges: z.boolean(),
  ahead: z.number().int(),
  behind: z.number().int(),
  branch: z.string(),
  lastCommit: z.string().optional(),
  remote: z.string().optional(),
  files: z.array(z.strictObject({ path: z.string(), status: z.string() })),
});

export type GitSyncStatus = z.output<typeof gitSyncStatusSchema>;

/**
 * Pull result — files changed by the pull operation.
 */
export const pullResultSchema: z.ZodObject<
  {
    files: z.ZodArray<z.ZodString>;
    deletedFiles: z.ZodOptional<z.ZodArray<z.ZodString>>;
  },
  z.core.$strict
> = z.strictObject({
  files: z.array(z.string()),
  deletedFiles: z.array(z.string()).optional(),
});

export type PullResult = z.output<typeof pullResultSchema>;

const commitShaSchema: z.ZodString = z.string().regex(/^[a-f0-9]{40,64}$/);

/** Durable identity and commit boundary for checkout-to-database reconciliation. */
export const gitReconciliationCheckpointSchema: z.ZodObject<
  {
    remoteFingerprint: z.ZodString;
    branch: z.ZodString;
    lastReconciledGitHead: z.ZodString;
    lastObservedRemoteHead: z.ZodOptional<z.ZodString>;
  },
  z.core.$strict
> = z.strictObject({
  /** SHA-256 of the credential-free configured remote URL. */
  remoteFingerprint: z.string().regex(/^[a-f0-9]{64}$/),
  branch: z.string().min(1).max(200),
  lastReconciledGitHead: commitShaSchema,
  /** Remote-tracking head used to distinguish authoritative remote deletions. */
  lastObservedRemoteHead: commitShaSchema.optional(),
});

export type GitReconciliationCheckpoint = z.output<
  typeof gitReconciliationCheckpointSchema
>;

export const gitReconciliationFallbackReasonSchema: z.ZodEnum<{
  "missing-checkpoint": "missing-checkpoint";
  "repository-identity-mismatch": "repository-identity-mismatch";
  "branch-mismatch": "branch-mismatch";
  "missing-local-checkpoint": "missing-local-checkpoint";
  "non-ancestor-local-checkpoint": "non-ancestor-local-checkpoint";
  "remote-checkpoint-mismatch": "remote-checkpoint-mismatch";
}> = z.enum([
  "missing-checkpoint",
  "repository-identity-mismatch",
  "branch-mismatch",
  "missing-local-checkpoint",
  "non-ancestor-local-checkpoint",
  "remote-checkpoint-mismatch",
]);

export type GitReconciliationFallbackReason = z.output<
  typeof gitReconciliationFallbackReasonSchema
>;

/** Changed checkout paths since the durable checkpoint, or a safe full-scan fallback. */
export const gitReconciliationDeltaSchema: z.ZodDiscriminatedUnion<
  [
    z.ZodObject<
      {
        mode: z.ZodLiteral<"incremental">;
        checkpoint: typeof gitReconciliationCheckpointSchema;
        files: z.ZodArray<z.ZodString>;
        deletedFiles: z.ZodArray<z.ZodString>;
      },
      z.core.$strict
    >,
    z.ZodObject<
      {
        mode: z.ZodLiteral<"full">;
        checkpoint: typeof gitReconciliationCheckpointSchema;
        reason: typeof gitReconciliationFallbackReasonSchema;
      },
      z.core.$strict
    >,
  ],
  "mode"
> = z.discriminatedUnion("mode", [
  z.strictObject({
    mode: z.literal("incremental"),
    checkpoint: gitReconciliationCheckpointSchema,
    files: z.array(z.string()),
    /** Only deletions observed on the remote-tracking branch. */
    deletedFiles: z.array(z.string()),
  }),
  z.strictObject({
    mode: z.literal("full"),
    checkpoint: gitReconciliationCheckpointSchema,
    reason: gitReconciliationFallbackReasonSchema,
  }),
]);

export type GitReconciliationDelta = z.output<
  typeof gitReconciliationDeltaSchema
>;

/**
 * Export result
 */
export const exportResultSchema: z.ZodObject<{
  exported: z.ZodNumber;
  failed: z.ZodNumber;
  errors: z.ZodArray<
    z.ZodObject<{
      entityId: z.ZodString;
      entityType: z.ZodString;
      error: z.ZodString;
    }>
  >;
}> = z.object({
  exported: z.number(),
  failed: z.number(),
  errors: z.array(
    z.object({
      entityId: z.string(),
      entityType: z.string(),
      error: z.string(),
    }),
  ),
});

export type ExportResult = z.output<typeof exportResultSchema>;

/**
 * Import result
 */
export const importResultSchema: z.ZodObject<{
  imported: z.ZodNumber;
  skipped: z.ZodNumber;
  failed: z.ZodNumber;
  quarantined: z.ZodNumber;
  quarantinedFiles: z.ZodArray<z.ZodString>;
  errors: z.ZodArray<z.ZodObject<{ path: z.ZodString; error: z.ZodString }>>;
  issues: z.ZodOptional<
    z.ZodArray<z.ZodObject<{ path: z.ZodString; message: z.ZodString }>>
  >;
  jobIds: z.ZodArray<z.ZodString>;
}> = z.object({
  imported: z.number(),
  skipped: z.number(),
  failed: z.number(),
  quarantined: z.number(),
  quarantinedFiles: z.array(z.string()),
  errors: z.array(
    z.object({
      path: z.string(),
      error: z.string(),
    }),
  ),
  // Optional so queued results created before this field was introduced still parse.
  issues: z
    .array(
      z.object({
        path: z.string(),
        message: z.string(),
      }),
    )
    .optional(),
  /** Job IDs for async embedding generation */
  jobIds: z.array(z.string()),
});

export type ImportResult = z.output<typeof importResultSchema>;

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
export const syncResultSchema: z.ZodObject<{
  export: typeof exportResultSchema;
  import: typeof importResultSchema;
  duration: z.ZodNumber;
}> = z.object({
  export: exportResultSchema,
  import: importResultSchema,
  duration: z.number(),
});

export type SyncResult = z.output<typeof syncResultSchema>;

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
export const gitLogEntrySchema: z.ZodObject<
  { sha: z.ZodString; date: z.ZodString; message: z.ZodString },
  z.core.$strict
> = z.strictObject({
  sha: z.string(),
  date: z.string(),
  message: z.string(),
});

export type GitLogEntry = z.output<typeof gitLogEntrySchema>;
