import { z } from "@brains/utils/zod";

/**
 * Schema for directory sync job data
 */
export interface DirectorySyncJobData {
  operation: "initial" | "scheduled" | "manual";
  paths?: string[] | undefined;
  entityTypes?: string[] | undefined;
  syncDirection?: "import" | "export" | "both" | undefined;
}

export const directorySyncJobSchema: z.ZodType<
  DirectorySyncJobData,
  DirectorySyncJobData
> = z.object({
  operation: z.enum(["initial", "scheduled", "manual"]),
  paths: z.array(z.string()).optional(),
  entityTypes: z.array(z.string()).optional(),
  syncDirection: z.enum(["import", "export", "both"]).optional(),
});

/**
 * Schema for a tool-initiated git pull + sync batch request.
 */
export interface DirectorySyncRequestJobData {
  source: string;
  interfaceType?: string | undefined;
  channelId?: string | undefined;
}

export const directorySyncRequestJobSchema: z.ZodType<
  DirectorySyncRequestJobData,
  DirectorySyncRequestJobData
> = z.object({
  source: z.string().min(1),
  interfaceType: z.string().optional(),
  channelId: z.string().optional(),
});

/**
 * Schema for directory import job data
 */
export interface DirectoryImportJobData {
  paths?: string[] | undefined;
  batchSize?: number | undefined;
  batchIndex?: number | undefined;
}

export const directoryImportJobSchema: z.ZodType<
  DirectoryImportJobData,
  DirectoryImportJobData
> = z.object({
  paths: z.array(z.string()).optional(),
  batchSize: z.number().min(1).optional(),
  batchIndex: z.number().optional(),
});

/**
 * Schema for directory export job data
 */
export interface DirectoryExportJobData {
  entityTypes?: string[] | undefined;
  batchSize?: number | undefined;
}

export const directoryExportJobSchema: z.ZodType<
  DirectoryExportJobData,
  DirectoryExportJobData
> = z.object({
  entityTypes: z.array(z.string()).optional(),
  batchSize: z.number().min(1).optional(),
});

/**
 * Schema for directory delete job data
 */
export interface DirectoryDeleteJobData {
  entityId: string;
  entityType: string;
  filePath: string;
}

export const directoryDeleteJobSchema: z.ZodType<
  DirectoryDeleteJobData,
  DirectoryDeleteJobData
> = z.object({
  entityId: z.string(),
  entityType: z.string(),
  filePath: z.string(),
});

/**
 * Schema for cover image conversion job data
 */
export interface CoverImageConversionJobData {
  filePath: string;
  sourceUrl: string;
  postTitle: string;
  postSlug: string;
  customAlt?: string | undefined;
}

export const coverImageConversionJobSchema: z.ZodType<
  CoverImageConversionJobData,
  CoverImageConversionJobData
> = z.object({
  filePath: z.string(),
  sourceUrl: z.url(),
  postTitle: z.string(),
  postSlug: z.string(),
  customAlt: z.string().optional(),
});

/**
 * Schema for inline image conversion job data
 */
export interface InlineImageConversionJobData {
  filePath: string;
  postSlug: string;
}

export const inlineImageConversionJobSchema: z.ZodType<
  InlineImageConversionJobData,
  InlineImageConversionJobData
> = z.object({
  /** Path to the markdown file to update */
  filePath: z.string(),
  /** Slug of the post (used for generating image IDs) */
  postSlug: z.string(),
});

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
