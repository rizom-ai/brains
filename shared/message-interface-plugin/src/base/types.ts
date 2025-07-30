import { z } from "zod";
import type { IInterfacePlugin } from "@brains/plugin-base";
import type { MessageContext } from "@brains/types";

/**
 * Message-based interface plugin type - extends IInterfacePlugin
 * Used for interfaces that process messages (CLI, Matrix, etc.)
 */
export interface IMessageInterfacePlugin extends IInterfacePlugin {
  /**
   * The unique session ID for this interface instance
   */
  readonly sessionId: string;
  /**
   * Process user input with context
   */
  processInput(input: string, context?: Partial<MessageContext>): Promise<void>;
}

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
