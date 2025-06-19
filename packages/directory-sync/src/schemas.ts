import { z } from "zod";

/**
 * Schema for directory sync status
 */
export const directorySyncStatusSchema = z
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

/**
 * Schema for directory sync config
 */
export const directorySyncConfigSchema = z.object({
  syncPath: z.string(),
  watchEnabled: z.boolean().optional(),
  watchInterval: z.number().optional(),
  entityTypes: z.array(z.string()).optional(),
});

/**
 * Schema for export result
 */
export const exportResultSchema = z.object({
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

/**
 * Schema for import result
 */
export const importResultSchema = z.object({
  imported: z.number(),
  skipped: z.number(),
  failed: z.number(),
  errors: z.array(
    z.object({
      path: z.string(),
      error: z.string(),
    }),
  ),
});

/**
 * Schema for sync result
 */
export const syncResultSchema = z.object({
  export: exportResultSchema,
  import: importResultSchema,
  duration: z.number(),
});
