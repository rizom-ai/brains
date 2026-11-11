import { z } from "@brains/utils/zod";

/**
 * Schema for directory sync job data
 */
export const directorySyncJobSchema: z.ZodObject<{
  operation: z.ZodEnum<{
    initial: "initial";
    scheduled: "scheduled";
    manual: "manual";
  }>;
  paths: z.ZodOptional<z.ZodArray<z.ZodString>>;
  entityTypes: z.ZodOptional<z.ZodArray<z.ZodString>>;
  syncDirection: z.ZodOptional<
    z.ZodEnum<{ import: "import"; export: "export"; both: "both" }>
  >;
}> = z.object({
  operation: z.enum(["initial", "scheduled", "manual"]),
  paths: z.array(z.string()).optional(),
  entityTypes: z.array(z.string()).optional(),
  syncDirection: z.enum(["import", "export", "both"]).optional(),
});

export type DirectorySyncJobData = z.output<typeof directorySyncJobSchema>;

/**
 * Schema for a tool-initiated git pull + sync batch request.
 */
export const directorySyncRequestJobSchema: z.ZodObject<{
  source: z.ZodString;
  runId: z.ZodOptional<z.ZodString>;
  interfaceType: z.ZodOptional<z.ZodString>;
  channelId: z.ZodOptional<z.ZodString>;
  full: z.ZodOptional<z.ZodBoolean>;
}> = z.object({
  source: z.string().min(1),
  runId: z.string().min(1).optional(),
  interfaceType: z.string().optional(),
  channelId: z.string().optional(),
  /** Rescan every file instead of the changes since the durable checkpoint. */
  full: z.boolean().optional(),
});

export type DirectorySyncRequestJobData = z.output<
  typeof directorySyncRequestJobSchema
>;

export const directoryProjectionBatchRefSchema: z.ZodObject<{
  operationId: z.ZodString;
  rootJobId: z.ZodString;
  childKey: z.ZodString;
  expectedChildren: z.ZodNumber;
}> = z.object({
  operationId: z.string().min(1),
  rootJobId: z.string().min(1),
  childKey: z.string().min(1),
  expectedChildren: z.number().int().positive(),
});

export type DirectoryProjectionBatchRef = z.output<
  typeof directoryProjectionBatchRefSchema
>;

export const directoryImportPlanSchema: z.ZodArray<
  z.ZodObject<{
    path: z.ZodString;
    entityType: z.ZodString;
    id: z.ZodString;
    expectedRevision: z.ZodNullable<z.ZodString>;
  }>
> = z.array(
  z.object({
    path: z.string(),
    entityType: z.string().min(1),
    id: z.string().min(1),
    expectedRevision: z.string().min(1).nullable(),
  }),
);

export type DirectoryImportPlan = z.output<typeof directoryImportPlanSchema>;

/**
 * Schema for directory import job data
 */
export const directoryImportJobSchema: z.ZodObject<{
  paths: z.ZodOptional<z.ZodArray<z.ZodString>>;
  batchSize: z.ZodOptional<z.ZodNumber>;
  batchIndex: z.ZodOptional<z.ZodNumber>;
  projectionBatch: z.ZodOptional<typeof directoryProjectionBatchRefSchema>;
  plan: z.ZodOptional<typeof directoryImportPlanSchema>;
  entityTypes: z.ZodOptional<z.ZodArray<z.ZodString>>;
}> = z.object({
  paths: z.array(z.string()).optional(),
  batchSize: z.number().min(1).optional(),
  batchIndex: z.number().optional(),
  projectionBatch: directoryProjectionBatchRefSchema.optional(),
  /** Queued batches retain their original preconditions across retries. */
  plan: directoryImportPlanSchema.optional(),
  /**
   * The registered entity types the scheduling process admitted into this
   * job. A worker that does not register one of them cannot import it.
   */
  entityTypes: z.array(z.string().min(1)).optional(),
});

export type DirectoryImportJobData = z.output<typeof directoryImportJobSchema>;

/**
 * Schema for directory export job data
 */
export const directoryExportJobSchema: z.ZodObject<{
  entityTypes: z.ZodOptional<z.ZodArray<z.ZodString>>;
  batchSize: z.ZodOptional<z.ZodNumber>;
}> = z.object({
  entityTypes: z.array(z.string()).optional(),
  batchSize: z.number().min(1).optional(),
});

export type DirectoryExportJobData = z.output<typeof directoryExportJobSchema>;

/**
 * Schema for directory delete job data
 */
const directoryDeleteTargetSchema: z.ZodObject<{
  entityId: z.ZodString;
  entityType: z.ZodString;
  filePath: z.ZodString;
}> = z.object({
  entityId: z.string(),
  entityType: z.string(),
  filePath: z.string(),
});

export type DirectoryDeleteTarget = z.output<
  typeof directoryDeleteTargetSchema
>;

export const directoryDeleteJobSchema: z.ZodUnion<
  [
    ReturnType<
      typeof directoryDeleteTargetSchema.extend<{
        projectionBatch: z.ZodOptional<
          typeof directoryProjectionBatchRefSchema
        >;
      }>
    >,
    z.ZodObject<{
      deletions: z.ZodArray<typeof directoryDeleteTargetSchema>;
      projectionBatch: z.ZodOptional<typeof directoryProjectionBatchRefSchema>;
    }>,
  ]
> = z.union([
  directoryDeleteTargetSchema.extend({
    projectionBatch: directoryProjectionBatchRefSchema.optional(),
  }),
  z.object({
    deletions: z.array(directoryDeleteTargetSchema).min(1).max(50),
    projectionBatch: directoryProjectionBatchRefSchema.optional(),
  }),
]);

export type DirectoryDeleteJobData = z.output<typeof directoryDeleteJobSchema>;

/**
 * Schema for cover image conversion job data
 */
export const coverImageConversionJobSchema: z.ZodObject<{
  filePath: z.ZodString;
  sourceUrl: z.ZodURL;
  postTitle: z.ZodString;
  postSlug: z.ZodString;
  customAlt: z.ZodOptional<z.ZodString>;
}> = z.object({
  filePath: z.string(),
  sourceUrl: z.url(),
  postTitle: z.string(),
  postSlug: z.string(),
  customAlt: z.string().optional(),
});

export type CoverImageConversionJobData = z.output<
  typeof coverImageConversionJobSchema
>;

/**
 * Schema for inline image conversion job data
 */
export const inlineImageConversionJobSchema: z.ZodObject<{
  filePath: z.ZodString;
  postSlug: z.ZodString;
}> = z.object({
  /** Path to the markdown file to update */
  filePath: z.string(),
  /** Slug of the post (used for generating image IDs) */
  postSlug: z.string(),
});

export type InlineImageConversionJobData = z.output<
  typeof inlineImageConversionJobSchema
>;

/**
 * Job request types for file watcher - discriminated union for type safety
 */
export type JobRequest =
  | { type: "directory-sync"; data: DirectorySyncJobData }
  | { type: "sync-request"; data: DirectorySyncRequestJobData }
  | { type: "directory-import"; data: DirectoryImportJobData }
  | { type: "directory-export"; data: DirectoryExportJobData }
  | { type: "directory-delete"; data: DirectoryDeleteJobData }
  | { type: "cover-image-convert"; data: CoverImageConversionJobData }
  | { type: "inline-image-convert"; data: InlineImageConversionJobData };
