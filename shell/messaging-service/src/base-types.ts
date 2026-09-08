import { z } from "@brains/utils/zod";

/**
 * Simple response schema for message handlers
 */
/**
 * Why a request failed, in a word a caller can branch on.
 *
 * `message` is for people and may be reworded at any time; this is the part
 * a package checks. Kept deliberately small: a code earns its place when a
 * caller has to do something different, not to name every way things go
 * wrong.
 *
 * - `no_handler`: nothing is listening on that channel, so the capability is
 *   not present in this brain rather than broken.
 * - `handler_failed`: something answered and threw.
 * - `invalid_input`: the request did not match the declared payload.
 * - `invalid_response`: the answer did not match the declared response.
 */
export const messageErrorCodeSchema: z.ZodEnum<{
  no_handler: "no_handler";
  handler_failed: "handler_failed";
  invalid_input: "invalid_input";
  invalid_response: "invalid_response";
}> = z.enum([
  "no_handler",
  "handler_failed",
  "invalid_input",
  "invalid_response",
]);

export type MessageErrorCode = z.output<typeof messageErrorCodeSchema>;

export const messageResponseSchema: z.ZodObject<{
  success: z.ZodBoolean;
  data: z.ZodOptional<z.ZodUnknown>;
  error: z.ZodOptional<z.ZodString>;
  code: z.ZodOptional<typeof messageErrorCodeSchema>;
}> = z.object({
  success: z.boolean(),
  data: z.unknown().optional(),
  error: z.string().optional(),
  code: messageErrorCodeSchema.optional(),
});

/** A handler's reply: the parsed response with its data narrowed to T, or a no-op. */
export type MessageResponse<T = unknown> =
  | (Omit<z.output<typeof messageResponseSchema>, "data"> & {
      data?: T | undefined;
    })
  | { noop: true };

type BaseMessageSchema = z.ZodObject<{
  id: z.ZodString;
  timestamp: z.ZodString;
  type: z.ZodString;
  source: z.ZodString;
  target: z.ZodOptional<z.ZodString>;
  metadata: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
}>;

/**
 * Base message schema - all messages must have these fields
 */
export const baseMessageSchema: BaseMessageSchema = z.object({
  id: z.string().min(1),
  timestamp: z.string(),
  type: z.string().min(1),
  source: z.string().min(1),
  target: z.string().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
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
export type BaseMessage = z.output<typeof baseMessageSchema>;

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
 * Options for sending messages
 */
export interface MessageSendOptions {
  /** Optional target for filtered delivery */
  target?: string;
  /** Optional metadata for filtered delivery */
  metadata?: Record<string, unknown>;
  /** If true, all matching handlers are called regardless of responses */
  broadcast?: boolean;
}

export interface MessageSendRequest<T = unknown> extends MessageSendOptions {
  type: string;
  payload: T;
}

export interface MessageBusSendRequest<
  T = unknown,
> extends MessageSendRequest<T> {
  sender: string;
}

/**
 * Message sender type for plugin-facing send functions where sender identity is
 * supplied by the runtime.
 */
export type MessageSender = <T = unknown, R = unknown>(
  request: MessageSendRequest<T>,
) => Promise<MessageResponse<R>>;
