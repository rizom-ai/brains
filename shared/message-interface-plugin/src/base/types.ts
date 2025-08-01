import { z } from "zod";

/**
 * Command response schemas
 */
export const batchOperationResponseSchema = z.object({
  type: z.literal("batch-operation"),
  batchId: z.string(),
  message: z.string(),
  operationCount: z.number(),
});

export type BatchOperationResponse = z.infer<
  typeof batchOperationResponseSchema
>;

export const jobResponseSchema = z.object({
  type: z.literal("job-operation"),
  jobId: z.string(),
  message: z.string(),
});

export type JobResponse = z.infer<typeof jobResponseSchema>;

export const messageResponseSchema = z.object({
  type: z.literal("message"),
  message: z.string(),
});

export type MessageResponse = z.infer<typeof messageResponseSchema>;

export const commandResponseSchema = z.union([
  batchOperationResponseSchema,
  jobResponseSchema,
  messageResponseSchema,
]);

export type CommandResponse = z.infer<typeof commandResponseSchema>;
