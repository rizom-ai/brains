import { messageErrorCodeSchema, type MessageErrorCode } from "./base-types";
import { parseHandlerResponse } from "./handler-response";
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
): InternalMessageResponse | null {
  const response = parseHandlerResponse(result);
  // A no-op is not an answer. Requests may try the next subscriber.
  if ("noop" in response) return null;

  return createInternalResponse(
    requestId,
    response.success,
    response.data,
    response.error,
    response.code,
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
      // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- the bus carries responses as unknown and only the caller knows R; removing this needs a response schema on Channel, which is a messaging contract change
      data: response.data as R,
    };
  }

  return {
    success: false,
    // Nothing answering is a different fact from something answering badly:
    // the first says the capability is absent from this brain, the second
    // that it broke. A caller that has to tell them apart reads the code.
    code: response
      ? (messageErrorCodeSchema.safeParse(response.error?.code).data ??
        "handler_failed")
      : "no_handler",
    error:
      response?.error?.message ??
      (response
        ? `Handler failed for message type: ${type}`
        : `No handler found for message type: ${type}`),
  };
}

function createInternalResponse(
  requestId: string,
  success: boolean,
  data?: unknown,
  error?: string,
  code?: MessageErrorCode,
): InternalMessageResponse {
  return {
    id: createId("resp"),
    requestId,
    timestamp: createTimestamp(),
    success,
    data,
    error:
      error || code
        ? {
            message: error ?? code ?? "Handler failed",
            ...(code ? { code } : {}),
          }
        : undefined,
  };
}

function createId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

function createTimestamp(): string {
  return new Date().toISOString();
}
