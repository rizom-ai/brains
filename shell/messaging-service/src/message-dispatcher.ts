import type { Logger } from "@brains/utils/logger";
import type { InternalMessageResponse, MessageWithPayload } from "./types";
import type { HandlerEntry } from "./handler-registry";
import { toInternalResponse } from "./message-factory";

export async function publishBroadcast(
  message: MessageWithPayload<unknown>,
  handlers: HandlerEntry[],
  logger: Logger,
): Promise<null> {
  // For broadcast messages, call ALL matching handlers regardless of responses.
  // Handlers run concurrently so one slow subscriber can't block the rest;
  // invokeHandler already catches individual handler errors.
  await Promise.all(
    handlers.map((entry) => invokeHandler(entry, message, logger)),
  );
  return null; // Broadcast messages don't return responses
}

export async function publishRequest(
  message: MessageWithPayload<unknown>,
  handlers: HandlerEntry[],
  logger: Logger,
): Promise<InternalMessageResponse | null> {
  // For regular messages, call handlers until one returns a response
  for (const entry of handlers) {
    const response = await invokeHandler(entry, message, logger);
    if (response) {
      return response;
    }
  }
  return null;
}

/** Invoke every matching request handler and preserve registration order. */
export async function collectHandlerResponses(
  message: MessageWithPayload<unknown>,
  handlers: HandlerEntry[],
  logger: Logger,
): Promise<InternalMessageResponse[]> {
  const responses = await Promise.all(
    handlers.map((entry) => invokeHandler(entry, message, logger)),
  );
  // Collection is an acknowledgement barrier, not best-effort broadcast.
  // Keep failures in their registration slots so one success cannot hide a
  // subscriber that threw or returned an invalid response.
  return responses.map(
    (response) =>
      response ??
      toInternalResponse(message.id, {
        success: false,
        error: `Message handler failed for message type: ${message.type}`,
      }),
  );
}

async function invokeHandler(
  entry: HandlerEntry,
  message: MessageWithPayload<unknown>,
  logger: Logger,
): Promise<InternalMessageResponse | null> {
  try {
    return await entry.handler(message);
  } catch (error) {
    logger.error(`Error in message handler for ${message.type}`, error);
    return null;
  }
}
