import { z } from "zod";

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

/**
 * Schema for batch operation data
 */
export const BatchOperationSchema = z.object({
  type: z.string(),
  entityId: z.string().optional(),
  entityType: z.string().optional(),
  options: z.record(z.unknown()).optional(),
});

/**
 * Schema for batch job data
 */
export const BatchJobDataSchema = z.object({
  operations: z.array(BatchOperationSchema),
  userId: z.string().optional(),
  startedAt: z.string(),
  // Progress tracking fields
  completedOperations: z.number().default(0),
  failedOperations: z.number().default(0),
  currentOperation: z.string().optional(),
  errors: z.array(z.string()).default([]),
});

/**
 * Schema for batch job status response
 */
export const BatchJobStatusSchema = z.object({
  batchId: z.string(),
  totalOperations: z.number(),
  completedOperations: z.number(),
  failedOperations: z.number(),
  currentOperation: z.string().optional(),
  errors: z.array(z.string()),
  status: JobStatusEnum,
});

export type JobStatus = z.infer<typeof JobStatusSchema>;
export type JobResult = z.infer<typeof JobResultSchema>;
export type BatchOperation = z.infer<typeof BatchOperationSchema>;
export type BatchJobData = z.infer<typeof BatchJobDataSchema>;
export type BatchJobStatus = z.infer<typeof BatchJobStatusSchema>;

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
      eta: z.number().optional(), // Estimated time remaining in milliseconds
      rate: z.number().optional(), // Items per second
    })
    .optional(),
  
  // Current operation description (required for better UX)
  operation: z.string(), // Current operation name/description

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
});
