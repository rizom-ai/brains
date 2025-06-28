import { z } from "zod";
import type {
  MessageResponse as MessageBusResponse,
  MessageHandler,
  BaseMessage,
} from "@brains/types";

export {
  messageResponseSchema as messageBusResponseSchema,
  messageWithPayloadSchema,
  baseMessageSchema,
  type MessageResponse as MessageBusResponse,
  type MessageWithPayload,
  type MessageHandler,
  type BaseMessage,
} from "@brains/types";

/**
 * Internal message response schema (with more details than the simple one)
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

// Derive types from schemas
export type MessageResponse = z.infer<typeof messageResponseSchema>;

/**
 * Type guard to check if a message has a payload
 */
export function hasPayload<P = unknown>(
  message: BaseMessage,
): message is BaseMessage & { payload: P } {
  return "payload" in message;
}

/**
 * Message bus interface
 */
export interface IMessageBus {
  send<T = unknown, R = unknown>(
    type: string,
    payload: T,
    sender: string,
  ): Promise<MessageBusResponse<R>>;

  subscribe<T = unknown, R = unknown>(
    type: string,
    handler: MessageHandler<T, R>,
  ): () => void;

  unsubscribe<T = unknown, R = unknown>(
    type: string,
    handler: MessageHandler<T, R>,
  ): void;
}
