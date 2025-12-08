/**
 * Batch-related Zod schemas
 * Separated to avoid pulling in all job queue schemas for external consumers
 */
import { z } from "@brains/utils";
import { JobContextSchema } from "./schema/types";

/**
 * Schema for batch operation data
 */
export const BatchOperationSchema = z.object({
  type: z.string(),
  data: z.record(z.string(), z.unknown()).default({}),
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
  status: z.enum(["pending", "processing", "completed", "failed"]),
  // Original batch metadata for routing context
  metadata: JobContextSchema.optional(),
});

/**
 * Schema for batch result with full metadata
 */
export const BatchSchema = z.object({
  batchId: z.string(),
  status: BatchJobStatusSchema,
  metadata: z.object({
    operations: z.array(BatchOperationSchema),
    source: z.string(),
    startedAt: z.string(),
    metadata: JobContextSchema,
  }),
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

// Schema-first: derive types from schemas
export type BatchOperation = z.infer<typeof BatchOperationSchema>;
export type BatchJobStatus = z.infer<typeof BatchJobStatusSchema>;
export type Batch = z.infer<typeof BatchSchema>;
export type BatchJobData = z.infer<typeof BatchJobDataSchema>;
