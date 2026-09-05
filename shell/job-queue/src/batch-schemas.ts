/**
 * Batch-related Zod schemas
 * Separated to avoid pulling in all job queue schemas for external consumers
 */
import { z } from "@brains/utils/zod";
import { JobContextSchema } from "./schema/types";

type BatchOperationSchema = z.ZodObject<{
  type: z.ZodString;
  data: z.ZodDefault<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
}>;

/**
 * Schema for batch operation data
 */
export const BatchOperationSchema: BatchOperationSchema = z.object({
  type: z.string(),
  data: z.record(z.string(), z.unknown()).default({}),
});

export type BatchOperation = z.output<typeof BatchOperationSchema>;

type BatchJobStatusSchema = z.ZodObject<{
  batchId: z.ZodString;
  totalOperations: z.ZodNumber;
  completedOperations: z.ZodNumber;
  failedOperations: z.ZodNumber;
  currentOperation: z.ZodOptional<z.ZodString>;
  errors: z.ZodArray<z.ZodString>;
  status: z.ZodEnum<{
    pending: "pending";
    processing: "processing";
    completed: "completed";
    failed: "failed";
  }>;
  metadata: z.ZodOptional<typeof JobContextSchema>;
}>;

/**
 * Schema for batch job status response
 */
export const BatchJobStatusSchema: BatchJobStatusSchema = z.object({
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

export type BatchJobStatus = z.output<typeof BatchJobStatusSchema>;

type BatchSchema = z.ZodObject<{
  batchId: z.ZodString;
  status: BatchJobStatusSchema;
  metadata: z.ZodObject<{
    operations: z.ZodArray<BatchOperationSchema>;
    source: z.ZodString;
    startedAt: z.ZodString;
    metadata: typeof JobContextSchema;
  }>;
}>;

/**
 * Schema for batch result with full metadata
 */
export const BatchSchema: BatchSchema = z.object({
  batchId: z.string(),
  status: BatchJobStatusSchema,
  metadata: z.object({
    operations: z.array(BatchOperationSchema),
    source: z.string(),
    startedAt: z.string(),
    metadata: JobContextSchema,
  }),
});

export type Batch = z.output<typeof BatchSchema>;

type BatchJobDataSchema = z.ZodObject<{
  operations: z.ZodArray<BatchOperationSchema>;
  userId: z.ZodOptional<z.ZodString>;
  startedAt: z.ZodString;
  completedOperations: z.ZodDefault<z.ZodNumber>;
  failedOperations: z.ZodDefault<z.ZodNumber>;
  currentOperation: z.ZodOptional<z.ZodString>;
  errors: z.ZodDefault<z.ZodArray<z.ZodString>>;
}>;

/**
 * Schema for batch job data
 */
export const BatchJobDataSchema: BatchJobDataSchema = z.object({
  operations: z.array(BatchOperationSchema),
  userId: z.string().optional(),
  startedAt: z.string(),
  // Progress tracking fields
  completedOperations: z.number().default(0),
  failedOperations: z.number().default(0),
  currentOperation: z.string().optional(),
  errors: z.array(z.string()).default([]),
});

export type BatchJobData = z.output<typeof BatchJobDataSchema>;
