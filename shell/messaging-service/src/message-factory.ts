import type {
  InternalMessageResponse,
  MessageResponse,
  MessageWithPayload,
} from "./types";

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
  result: MessageResponse<unknown>,
): InternalMessageResponse {
  // Handle noop responses for broadcast events
  if ("noop" in result) {
    return createInternalResponse(requestId, true);
  }

  // Type guard: if we get here, result must have success/data/error properties
  if ("success" in result) {
    return createInternalResponse(
      requestId,
      result.success,
      result.data,
      result.error,
    );
  }

  throw new Error("Invalid message response format");
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
