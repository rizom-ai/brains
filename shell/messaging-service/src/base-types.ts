import { z } from "zod";

/**
 * Simple response schema for message handlers
 */
export const messageResponseSchema = z.object({
  success: z.boolean(),
  data: z.unknown().optional(),
  error: z.string().optional(),
});

/**
 * Base message schema - all messages must have these fields
 */
export const baseMessageSchema = z.object({
  id: z.string().min(1),
  timestamp: z.string(),
  type: z.string().min(1),
  source: z.string().min(1),
  target: z.string().optional(),
  metadata: z.record(z.unknown()).optional(),
});

/**
 * Message with payload schema
 */
export const messageWithPayloadSchema = <T extends z.ZodType>(
  payloadSchema: T,
): ReturnType<typeof baseMessageSchema.extend<{ payload: T }>> =>
  baseMessageSchema.extend({
    payload: payloadSchema,
  });

// Derive types from schemas
export type MessageResponse<T = unknown> =
  | (Omit<z.infer<typeof messageResponseSchema>, "data"> & { data?: T })
  | { noop: true };

export type BaseMessage = z.infer<typeof baseMessageSchema>;

export type MessageWithPayload<T = unknown> = BaseMessage & {
  payload: T;
};

/**
 * Message handler type
 */
export type MessageHandler<T = unknown, R = unknown> = (
  message: MessageWithPayload<T>,
) => Promise<MessageResponse<R>> | MessageResponse<R>;

/**
 * Message sender type
 */
export type MessageSender = <T = unknown, R = unknown>(
  type: string,
  payload: T,
) => Promise<MessageResponse<R>>;