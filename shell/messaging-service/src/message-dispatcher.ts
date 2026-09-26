import { toSdkError } from "@brains/contracts";
import { toInternalResponse } from "./message-factory";
import type { SdkErrorCode } from "./base-types";
import type { Logger } from "@brains/utils/logger";
import type { InternalMessageResponse, MessageWithPayload } from "./types";
import type { HandlerEntry } from "./handler-registry";

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
  // Preserve fallback order, but distinguish failed handlers from no answer.
  const failures: SdkErrorCode[] = [];
  for (const entry of handlers) {
    const response = await invokeHandler(entry, message, logger, (code) => {
      failures.push(code);
    });
    if (response) {
      return response;
    }
  }
  const code = failures[0];
  return code
    ? toInternalResponse(message.id, {
        success: false,
        code,
        error: `Message request failed: ${code}`,
      })
    : null;
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
  return responses.filter(
    (response): response is InternalMessageResponse => response !== null,
  );
}

async function invokeHandler(
  entry: HandlerEntry,
  message: MessageWithPayload<unknown>,
  logger: Logger,
  onFailure?: (code: SdkErrorCode) => void,
): Promise<InternalMessageResponse | null> {
  try {
    return await entry.handler(message);
  } catch (error) {
    const { code } = toSdkError(error);
    // A generic dispatcher cannot know whether an exception embeds credentials
    // or private request data. Handlers may log their own sanitized diagnostics.
    logger.error(`Error in message handler for ${message.type}`, { code });
    onFailure?.(code);
    return null;
  }
}
