import { z } from "@brains/utils/zod-v4";

/**
 * Schema for directory sync job data
 */
export const directorySyncJobSchema = z.object({
  operation: z.enum(["initial", "scheduled", "manual"]),
  paths: z.array(z.string()).optional(),
  entityTypes: z.array(z.string()).optional(),
  syncDirection: z.enum(["import", "export", "both"]).optional(),
});

export type DirectorySyncJobData = z.output<typeof directorySyncJobSchema>;

/**
 * Schema for a tool-initiated git pull + sync batch request.
 */
export const directorySyncRequestJobSchema = z.object({
  source: z.string().min(1),
  interfaceType: z.string().optional(),
  channelId: z.string().optional(),
});

export type DirectorySyncRequestJobData = z.output<
  typeof directorySyncRequestJobSchema
>;

/**
 * Schema for directory import job data
 */
export const directoryImportJobSchema = z.object({
  paths: z.array(z.string()).optional(),
  batchSize: z.number().min(1).optional(),
  batchIndex: z.number().optional(),
});

export type DirectoryImportJobData = z.output<typeof directoryImportJobSchema>;

/**
 * Schema for directory export job data
 */
export const directoryExportJobSchema = z.object({
  entityTypes: z.array(z.string()).optional(),
  batchSize: z.number().min(1).optional(),
});

export type DirectoryExportJobData = z.output<typeof directoryExportJobSchema>;

/**
 * Schema for directory delete job data
 */
export const directoryDeleteJobSchema = z.object({
  entityId: z.string(),
  entityType: z.string(),
  filePath: z.string(),
});

export type DirectoryDeleteJobData = z.output<typeof directoryDeleteJobSchema>;

/**
 * Schema for cover image conversion job data
 */
export const coverImageConversionJobSchema = z.object({
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
export const inlineImageConversionJobSchema = z.object({
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
