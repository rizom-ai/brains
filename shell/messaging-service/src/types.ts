import { z } from "@brains/utils";
import type { UserPermissionLevel } from "@brains/templates";
import type {
  MessageResponse,
  MessageHandler,
  BaseMessage,
  MessageWithPayload,
} from "./base-types";

export {
  messageResponseSchema,
  messageWithPayloadSchema,
  baseMessageSchema,
  type MessageResponse,
  type MessageWithPayload,
  type MessageHandler,
  type MessageSender,
  type MessageSendOptions,
  type BaseMessage,
} from "./base-types";

/**
 * Internal message bus response schema (with more details than the simple MessageResponse)
 * This is used internally by the message bus for tracking and debugging
 */
export const internalMessageResponseSchema = z.object({
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
export type InternalMessageResponse = z.infer<
  typeof internalMessageResponseSchema
>;

/**
 * Type guard to check if a message has a payload
 */
export function hasPayload<P = unknown>(
  message: BaseMessage,
): message is BaseMessage & { payload: P } {
  return "payload" in message;
}

/**
 * Subscription filter for targeted message delivery
 */
export interface SubscriptionFilter {
  source?: string | RegExp;
  target?: string | RegExp;
  metadata?: Record<string, unknown>;
  predicate?: (message: MessageWithPayload) => boolean;
}

/**
 * Message context for interface operations
 * Used by message-based interfaces to provide context about the message
 */
export interface MessageContext {
  userId: string;
  channelId: string;
  messageId: string;
  timestamp: Date;
  interfaceType: string;
  userPermissionLevel: UserPermissionLevel;
  threadId?: string;
}

/**
 * Message bus interface
 */
export interface IMessageBus {
  send<T = unknown, R = unknown>(
    type: string,
    payload: T,
    sender: string,
    target?: string,
    metadata?: Record<string, unknown>,
    broadcast?: boolean,
  ): Promise<MessageResponse<R>>;

  subscribe<T = unknown, R = unknown>(
    type: string,
    handler: MessageHandler<T, R>,
    filter?: SubscriptionFilter,
  ): () => void;

  unsubscribe<T = unknown, R = unknown>(
    type: string,
    handler: MessageHandler<T, R>,
  ): void;
}
