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
  result: unknown,
): InternalMessageResponse {
  if (!isResponseRecord(result)) {
    throw new Error("Invalid message response format");
  }

  // Handle noop responses for broadcast events
  if ("noop" in result) {
    return createInternalResponse(requestId, true);
  }

  // Type guard: if we get here, result must have success/data/error properties
  if ("success" in result) {
    const response = result as Exclude<
      MessageResponse<unknown>,
      { noop: true }
    >;
    return createInternalResponse(
      requestId,
      response.success,
      response.data,
      response.error,
    );
  }

  throw new Error("Invalid message response format");
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

function isResponseRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
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
