import type { Logger } from "@brains/utils";
import type { InternalMessageResponse, MessageWithPayload } from "./types";
import type { HandlerEntry } from "./handler-registry";

export async function publishBroadcast(
  message: MessageWithPayload<unknown>,
  handlers: HandlerEntry[],
  logger: Logger,
): Promise<null> {
  // For broadcast messages, call ALL matching handlers regardless of responses
  for (const entry of handlers) {
    try {
      await entry.handler(message);
    } catch (error) {
      logger.error(`Error in message handler for ${message.type}`, error);
    }
  }
  return null; // Broadcast messages don't return responses
}

export async function publishRequest(
  message: MessageWithPayload<unknown>,
  handlers: HandlerEntry[],
  logger: Logger,
): Promise<InternalMessageResponse | null> {
  // For regular messages, call handlers until one returns a response
  for (const entry of handlers) {
    try {
      const response = await entry.handler(message);
      if (response) {
        return response;
      }
    } catch (error) {
      logger.error(`Error in message handler for ${message.type}`, error);
    }
  }
  return null;
}
