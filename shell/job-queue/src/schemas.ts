import { z } from "@brains/utils/zod";
// Import JobContextSchema from types file (no Drizzle dependencies)
import { JobContextSchema } from "./schema/types";

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

export type JobStatusType = z.output<typeof JobStatusEnum>;
export type JobResultStatusType = z.output<typeof JobResultStatusEnum>;

/**
 * Job status constants for easier usage
 */
export const JOB_STATUS = {
  PENDING: "pending" as const,
  PROCESSING: "processing" as const,
  COMPLETED: "completed" as const,
  FAILED: "failed" as const,
} as const;

type JobStatusSchema = z.ZodObject<{
  id: z.ZodString;
  type: z.ZodString;
  status: typeof JobStatusEnum;
  data: z.ZodUnknown;
  result: z.ZodOptional<z.ZodUnknown>;
  lastError: z.ZodNullable<z.ZodOptional<z.ZodString>>;
  attempts: z.ZodNumber;
  maxRetries: z.ZodNumber;
  priority: z.ZodNumber;
  createdAt: z.ZodDate;
  updatedAt: z.ZodDate;
  processedAt: z.ZodNullable<z.ZodOptional<z.ZodDate>>;
  completedAt: z.ZodNullable<z.ZodOptional<z.ZodDate>>;
  failedAt: z.ZodNullable<z.ZodOptional<z.ZodDate>>;
}>;

/**
 * Base job status schema - common fields for all job types
 */
export const JobStatusSchema: JobStatusSchema = z.object({
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

export type JobStatus = z.output<typeof JobStatusSchema>;

type JobResultSchema = z.ZodObject<{
  jobId: z.ZodString;
  type: z.ZodString;
  status: typeof JobResultStatusEnum;
  result: z.ZodOptional<z.ZodUnknown>;
  error: z.ZodOptional<z.ZodString>;
}>;

/**
 * Job result schema after processing
 */
export const JobResultSchema: JobResultSchema = z.object({
  jobId: z.string(),
  type: z.string(),
  status: JobResultStatusEnum,
  result: z.unknown().optional(),
  error: z.string().optional(),
});

export type JobResult = z.output<typeof JobResultSchema>;

type HandlerFailureSchema = z.ZodObject<{
  success: z.ZodLiteral<false>;
  error: z.ZodOptional<z.ZodString>;
}>;

/**
 * Controlled handler failure result.
 * Handlers may return this shape for known, non-exception failure conditions.
 */
export const HandlerFailureSchema: HandlerFailureSchema = z.object({
  success: z.literal(false),
  error: z.string().optional(),
});

export type HandlerFailure = z.output<typeof HandlerFailureSchema>;

type JobProgressEventSchema = z.ZodObject<{
  id: z.ZodString;
  type: z.ZodEnum<{ job: "job"; batch: "batch" }>;
  status: typeof JobStatusEnum;
  message: z.ZodOptional<z.ZodString>;
  progress: z.ZodOptional<
    z.ZodObject<{
      current: z.ZodNumber;
      total: z.ZodNumber;
      percentage: z.ZodNumber;
    }>
  >;
  aggregationKey: z.ZodOptional<z.ZodString>;
  batchDetails: z.ZodOptional<
    z.ZodObject<{
      totalOperations: z.ZodNumber;
      completedOperations: z.ZodNumber;
      failedOperations: z.ZodNumber;
      currentOperation: z.ZodOptional<z.ZodString>;
      errors: z.ZodOptional<z.ZodArray<z.ZodString>>;
    }>
  >;
  jobDetails: z.ZodOptional<
    z.ZodObject<{
      jobType: z.ZodString;
      priority: z.ZodNumber;
      retryCount: z.ZodNumber;
    }>
  >;
  metadata: typeof JobContextSchema;
}>;

/**
 * Schema for job progress events
 */
export const JobProgressEventSchema: JobProgressEventSchema = z.object({
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

/** Derived from the schema so the two can never drift. */
export type JobProgressEvent = z.output<typeof JobProgressEventSchema>;
