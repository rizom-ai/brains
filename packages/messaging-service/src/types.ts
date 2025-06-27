import { z } from "zod";

/**
 * Base message schema - all messages must conform to this
 */
export const baseMessageSchema = z.object({
  id: z.string().min(1),
  timestamp: z.string().datetime(),
  type: z.string().min(1),
  source: z.string().optional(),
  target: z.string().optional(),
});

export type BaseMessage = z.infer<typeof baseMessageSchema>;

/**
 * Extended message schema with payload
 */
export const messageSchema = <T extends z.ZodType>(
  payloadSchema: T,
): ReturnType<typeof baseMessageSchema.extend<{ payload: T }>> =>
  baseMessageSchema.extend({
    payload: payloadSchema,
  });

/**
 * Message response schema
 */
export const messageResponseSchema = z.object({
  id: z.string().min(1),
  requestId: z.string().min(1),
  success: z.boolean(),
  data: z.unknown().optional(),
  error: z
    .object({
      message: z.string(),
      code: z.string().optional(),
    })
    .optional(),
  timestamp: z.string().datetime(),
});

export type MessageResponse = z.infer<typeof messageResponseSchema>;

/**
 * Message handler type
 */
export type MessageHandler<T extends BaseMessage = BaseMessage> = (
  message: T,
) => Promise<MessageResponse | null>;

/**
 * Type-safe message type
 */
export type Message<T extends string = string, P = unknown> = BaseMessage & {
  type: T;
  payload?: P;
};

/**
 * Message with payload - extends BaseMessage to include payload
 */
export interface MessageWithPayload<P = unknown> extends BaseMessage {
  payload: P;
}

/**
 * Type guard to check if a message has a payload
 */
export function hasPayload<P = unknown>(
  message: BaseMessage,
): message is MessageWithPayload<P> {
  return "payload" in message;
}
