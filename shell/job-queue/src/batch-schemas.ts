/**
 * Batch-related Zod schemas
 * Separated to avoid pulling in all job queue schemas for external consumers
 */
import { z } from "@brains/utils/zod";
import { JobContextSchema, type JobContext } from "./schema/types";

export interface BatchOperation {
  type: string;
  data: Record<string, unknown>;
}

export interface BatchJobStatus {
  batchId: string;
  totalOperations: number;
  completedOperations: number;
  failedOperations: number;
  currentOperation?: string | undefined;
  errors: string[];
  status: "pending" | "processing" | "completed" | "failed";
  metadata?: JobContext | undefined;
}

export interface Batch {
  batchId: string;
  status: BatchJobStatus;
  metadata: {
    operations: BatchOperation[];
    source: string;
    startedAt: string;
    metadata: JobContext;
  };
}

export interface BatchJobData {
  operations: BatchOperation[];
  userId?: string | undefined;
  startedAt: string;
  completedOperations: number;
  failedOperations: number;
  currentOperation?: string | undefined;
  errors: string[];
}

/**
 * Schema for batch operation data
 */
export const BatchOperationSchema: z.ZodType<BatchOperation, unknown> =
  z.object({
    type: z.string(),
    data: z.record(z.string(), z.unknown()).default({}),
  });

/**
 * Schema for batch job status response
 */
export const BatchJobStatusSchema: z.ZodType<BatchJobStatus, unknown> =
  z.object({
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
export const BatchSchema: z.ZodType<Batch, unknown> = z.object({
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
export const BatchJobDataSchema: z.ZodType<BatchJobData, unknown> = z.object({
  operations: z.array(BatchOperationSchema),
  userId: z.string().optional(),
  startedAt: z.string(),
  // Progress tracking fields
  completedOperations: z.number().default(0),
  failedOperations: z.number().default(0),
  currentOperation: z.string().optional(),
  errors: z.array(z.string()).default([]),
});
