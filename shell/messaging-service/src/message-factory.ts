import { z } from "@brains/utils";
import { messageResponseSchema } from "./base-types";
import type {
  InternalMessageResponse,
  MessageResponse,
  MessageWithPayload,
} from "./types";

const handlerResponseSchema = z.union([
  z.object({ noop: z.literal(true) }),
  messageResponseSchema,
]);

/**
 * Create a message with generated metadata required by the bus.
 */
export function createMessage<T>(
  type: string,
  payload: T,
  sender: string,
  target?: string,
  metadata?: Record<string, unknown>,
): MessageWithPayload<T> {
  return {
    id: createId("msg"),
    type,
    timestamp: createTimestamp(),
    source: sender,
    target,
    metadata,
    payload,
  };
}

/**
 * Convert a public handler response into the richer internal response shape.
 */
export function toInternalResponse(
  requestId: string,
  result: unknown,
): InternalMessageResponse {
  const parsed = handlerResponseSchema.safeParse(result);
  if (!parsed.success) {
    throw new Error("Invalid message response format");
  }

  const response = parsed.data;
  // Handle noop responses for broadcast events
  if ("noop" in response) {
    return createInternalResponse(requestId, true);
  }

  return createInternalResponse(
    requestId,
    response.success,
    response.data,
    response.error,
  );
}

/**
 * Convert an internal bus response into the public MessageResponse shape.
 */
export function toMessageResponse<R>(
  type: string,
  response: InternalMessageResponse | null,
): MessageResponse<R> {
  if (response?.success) {
    return {
      success: true,
      data: response.data as R,
    };
  }

  return {
    success: false,
    error:
      response?.error?.message ?? `No handler found for message type: ${type}`,
  };
}

function createInternalResponse(
  requestId: string,
  success: boolean,
  data?: unknown,
  error?: string,
): InternalMessageResponse {
  return {
    id: createId("resp"),
    requestId,
    timestamp: createTimestamp(),
    success,
    data,
    error: error ? { message: error } : undefined,
  };
}

function createId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

function createTimestamp(): string {
  return new Date().toISOString();
}
