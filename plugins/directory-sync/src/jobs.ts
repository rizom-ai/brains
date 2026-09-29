import { defineJob, type ServiceJobDefinition } from "@brains/sdk/services";
import { z } from "@brains/utils/zod";
import {
  exportResultSchema,
  importResultSchema,
  syncResultSchema,
} from "./schemas";
import {
  coverImageConversionJobSchema,
  directoryDeleteJobSchema,
  directoryExportJobSchema,
  directoryImportJobSchema,
  directorySyncJobSchema,
  directorySyncRequestJobSchema,
  durableBulkMutationChildRefSchema,
  inlineImageConversionJobSchema,
  type CleanupResult,
  type DeleteResult,
  type DirectoryDeleteJobResult,
  type DirectorySyncJobType,
  type DurableBulkMutationChildRef,
} from "./types";

/** What a cleanup pass reports. */
export const cleanupResultSchema: z.ZodType<CleanupResult, CleanupResult> =
  z.object({
    deleted: z.number().int().nonnegative(),
    errors: z.array(
      z.object({
        entityId: z.string(),
        entityType: z.string(),
        error: z.string(),
      }),
    ),
  });

const deleteResultSchema: z.ZodType<DeleteResult, DeleteResult> = z.object({
  deleted: z.boolean(),
  entityId: z.string(),
  entityType: z.string(),
  filePath: z.string(),
});

/** One deletion, or the batch of them a single job took on. */
export const directoryDeleteJobResultSchema: z.ZodType<
  DirectoryDeleteJobResult,
  DirectoryDeleteJobResult
> = z.union([deleteResultSchema, z.array(deleteResultSchema)]);

/** What a git-backed sync request reports once the pull has been queued. */
export const directorySyncRequestJobResultSchema: z.ZodObject<{
  gitPulled: z.ZodLiteral<true>;
  batchQueued: z.ZodBoolean;
  batchId: z.ZodOptional<z.ZodString>;
  importOperations: z.ZodOptional<z.ZodNumber>;
  totalFiles: z.ZodOptional<z.ZodNumber>;
}> = z.object({
  gitPulled: z.literal(true),
  batchQueued: z.boolean(),
  batchId: z.string().optional(),
  importOperations: z.number().int().nonnegative().optional(),
  totalFiles: z.number().int().nonnegative().optional(),
});
export type DirectorySyncRequestJobResult = z.output<
  typeof directorySyncRequestJobResultSchema
>;

/** What converting one cover image reports. */
export const imageConversionResultSchema: z.ZodObject<{
  success: z.ZodBoolean;
  imageId: z.ZodOptional<z.ZodString>;
  skipped: z.ZodOptional<z.ZodBoolean>;
  error: z.ZodOptional<z.ZodString>;
}> = z.object({
  success: z.boolean(),
  imageId: z.string().optional(),
  skipped: z.boolean().optional(),
  error: z.string().optional(),
});
export type ImageConversionResult = z.output<
  typeof imageConversionResultSchema
>;

/** What converting a file's inline images reports. */
export const inlineImageConversionResultSchema: z.ZodObject<{
  success: z.ZodBoolean;
  convertedCount: z.ZodOptional<z.ZodNumber>;
  skipped: z.ZodOptional<z.ZodBoolean>;
  error: z.ZodOptional<z.ZodString>;
}> = z.object({
  success: z.boolean(),
  convertedCount: z.number().int().nonnegative().optional(),
  skipped: z.boolean().optional(),
  error: z.string().optional(),
});
export type InlineImageConversionResult = z.output<
  typeof inlineImageConversionResultSchema
>;

export interface DirectoryCleanupJobData {
  projectionBatch?: DurableBulkMutationChildRef | undefined;
}

export const directoryCleanupJobSchema: z.ZodType<
  DirectoryCleanupJobData,
  DirectoryCleanupJobData
> = z.object({
  projectionBatch: durableBulkMutationChildRefSchema.optional(),
});

/**
 * The work directory-sync files on the queue, declared once. A sweep is
 * enqueued as a batch of these; the watcher, the tools and the periodic pull
 * all name them by declaration rather than by string.
 */
export const directorySyncJob: ServiceJobDefinition<
  "directory-sync",
  typeof directorySyncJobSchema,
  typeof syncResultSchema
> = defineJob({
  name: "directory-sync",
  input: directorySyncJobSchema,
  output: syncResultSchema,
});

export const syncRequestJob: ServiceJobDefinition<
  "sync-request",
  typeof directorySyncRequestJobSchema,
  typeof directorySyncRequestJobResultSchema
> = defineJob({
  name: "sync-request",
  input: directorySyncRequestJobSchema,
  output: directorySyncRequestJobResultSchema,
});

export const directoryImportJob: ServiceJobDefinition<
  "directory-import",
  typeof directoryImportJobSchema,
  typeof importResultSchema
> = defineJob({
  name: "directory-import",
  input: directoryImportJobSchema,
  output: importResultSchema,
});

export const directoryExportJob: ServiceJobDefinition<
  "directory-export",
  typeof directoryExportJobSchema,
  typeof exportResultSchema
> = defineJob({
  name: "directory-export",
  input: directoryExportJobSchema,
  output: exportResultSchema,
});

export const directoryDeleteJob: ServiceJobDefinition<
  "directory-delete",
  typeof directoryDeleteJobSchema,
  typeof directoryDeleteJobResultSchema
> = defineJob({
  name: "directory-delete",
  input: directoryDeleteJobSchema,
  output: directoryDeleteJobResultSchema,
});

export const directoryCleanupJob: ServiceJobDefinition<
  "directory-cleanup",
  typeof directoryCleanupJobSchema,
  typeof cleanupResultSchema
> = defineJob({
  name: "directory-cleanup",
  input: directoryCleanupJobSchema,
  output: cleanupResultSchema,
});

export const coverImageConvertJob: ServiceJobDefinition<
  "cover-image-convert",
  typeof coverImageConversionJobSchema,
  typeof imageConversionResultSchema
> = defineJob({
  name: "cover-image-convert",
  input: coverImageConversionJobSchema,
  output: imageConversionResultSchema,
});

export const inlineImageConvertJob: ServiceJobDefinition<
  "inline-image-convert",
  typeof inlineImageConversionJobSchema,
  typeof inlineImageConversionResultSchema
> = defineJob({
  name: "inline-image-convert",
  input: inlineImageConversionJobSchema,
  output: inlineImageConversionResultSchema,
});

const definitionsByType: Readonly<
  Record<DirectorySyncJobType, ServiceJobDefinition>
> = {
  "directory-sync": directorySyncJob,
  "sync-request": syncRequestJob,
  "directory-import": directoryImportJob,
  "directory-export": directoryExportJob,
  "directory-delete": directoryDeleteJob,
  "directory-cleanup": directoryCleanupJob,
  "cover-image-convert": coverImageConvertJob,
  "inline-image-convert": inlineImageConvertJob,
};

/** The declaration behind a job type name the batch builder produced. */
export function jobDefinitionFor(
  type: DirectorySyncJobType,
): ServiceJobDefinition {
  return definitionsByType[type];
}
