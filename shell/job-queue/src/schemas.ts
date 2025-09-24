import { z } from "@brains/utils";
// Import JobContextSchema from types file (no Drizzle dependencies)
import { JobContextSchema } from "./schema/types";

/**
 * Job status enum - reusable across all job-related types
 */
export const JobStatusEnum = z.enum([
  "pending",
  "processing",
  "completed",
  "failed",
]);
export type JobStatusType = z.infer<typeof JobStatusEnum>;

/**
 * Job result status enum - only final states
 */
export const JobResultStatusEnum = z.enum(["completed", "failed"]);
export type JobResultStatusType = z.infer<typeof JobResultStatusEnum>;

/**
 * Job status constants for easier usage
 */
export const JOB_STATUS = {
  PENDING: "pending" as const,
  PROCESSING: "processing" as const,
  COMPLETED: "completed" as const,
  FAILED: "failed" as const,
} as const;

/**
 * Base job status schema - common fields for all job types
 */
export const JobStatusSchema = z.object({
  id: z.string(),
  type: z.string(),
  status: JobStatusEnum,
  data: z.unknown(),
  result: z.unknown().optional(),
  lastError: z.string().optional().nullable(),
  attempts: z.number(),
  maxRetries: z.number(),
  priority: z.number(),
  createdAt: z.date(),
  updatedAt: z.date(),
  processedAt: z.date().optional().nullable(),
  completedAt: z.date().optional().nullable(),
  failedAt: z.date().optional().nullable(),
});

/**
 * Job result schema after processing
 */
export const JobResultSchema = z.object({
  jobId: z.string(),
  type: z.string(),
  status: JobResultStatusEnum,
  result: z.unknown().optional(),
  error: z.string().optional(),
});

export type JobStatus = z.infer<typeof JobStatusSchema>;
export type JobResult = z.infer<typeof JobResultSchema>;

/**
 * Schema for job progress events
 */
export const JobProgressEventSchema = z.object({
  // Common fields
  id: z.string(),
  type: z.enum(["job", "batch"]),
  status: JobStatusEnum,
  message: z.string().optional(),

  // Progress tracking
  progress: z
    .object({
      current: z.number(),
      total: z.number(),
      percentage: z.number(),
    })
    .optional(),

  // Optional aggregation metadata
  aggregationKey: z.string().optional(), // explicit grouping override

  // Batch-specific fields
  batchDetails: z
    .object({
      totalOperations: z.number(),
      completedOperations: z.number(),
      failedOperations: z.number(),
      currentOperation: z.string().optional(),
      errors: z.array(z.string()).optional(),
    })
    .optional(),

  // Job-specific fields
  jobDetails: z
    .object({
      jobType: z.string(),
      priority: z.number(),
      retryCount: z.number(),
    })
    .optional(),

  // Routing metadata
  metadata: JobContextSchema,
});

export type JobProgressEvent = z.infer<typeof JobProgressEventSchema>;
