import { z } from "@brains/utils/zod";
// Import JobContextSchema from types file (no Drizzle dependencies)
import { JobContextSchema, type JobContext } from "./schema/types";

export type JobStatusType = "pending" | "processing" | "completed" | "failed";
export type JobResultStatusType = "completed" | "failed";

export interface JobStatus {
  id: string;
  type: string;
  status: JobStatusType;
  data: unknown;
  result?: unknown;
  lastError?: string | null | undefined;
  attempts: number;
  maxRetries: number;
  priority: number;
  createdAt: Date;
  updatedAt: Date;
  processedAt?: Date | null | undefined;
  completedAt?: Date | null | undefined;
  failedAt?: Date | null | undefined;
}

export interface JobResult {
  jobId: string;
  type: string;
  status: JobResultStatusType;
  result?: unknown;
  error?: string | undefined;
}

export interface HandlerFailure {
  success: false;
  error?: string | undefined;
}

export interface JobProgressEvent {
  id: string;
  type: "job" | "batch";
  status: JobStatusType;
  message?: string | undefined;
  progress?:
    | {
        current: number;
        total: number;
        percentage: number;
      }
    | undefined;
  aggregationKey?: string | undefined;
  batchDetails?:
    | {
        totalOperations: number;
        completedOperations: number;
        failedOperations: number;
        currentOperation?: string | undefined;
        errors?: string[] | undefined;
      }
    | undefined;
  jobDetails?:
    | {
        jobType: string;
        priority: number;
        retryCount: number;
      }
    | undefined;
  metadata: JobContext;
}

/**
 * Job status enum - reusable across all job-related types
 */
export const JobStatusEnum: z.ZodEnum<{
  pending: "pending";
  processing: "processing";
  completed: "completed";
  failed: "failed";
}> = z.enum(["pending", "processing", "completed", "failed"]);

/**
 * Job result status enum - only final states
 */
export const JobResultStatusEnum: z.ZodEnum<{
  completed: "completed";
  failed: "failed";
}> = z.enum(["completed", "failed"]);

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
export const JobStatusSchema: z.ZodType<JobStatus, unknown> = z.object({
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
export const JobResultSchema: z.ZodType<JobResult, unknown> = z.object({
  jobId: z.string(),
  type: z.string(),
  status: JobResultStatusEnum,
  result: z.unknown().optional(),
  error: z.string().optional(),
});

/**
 * Controlled handler failure result.
 * Handlers may return this shape for known, non-exception failure conditions.
 */
export const HandlerFailureSchema: z.ZodType<HandlerFailure, unknown> =
  z.object({
    success: z.literal(false),
    error: z.string().optional(),
  });

/**
 * Schema for job progress events
 */
export const JobProgressEventSchema: z.ZodType<JobProgressEvent, unknown> =
  z.object({
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
