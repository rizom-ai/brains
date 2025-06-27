import { createId } from "@brains/db/schema";
import type { Message, MessageResponse } from "./types";

/**
 * Factory for creating messages with proper types and IDs
 */
export class MessageFactory {
  /**
   * Create a base message
   */
  static createMessage<T extends string>(
    type: T,
    source?: string,
    target?: string,
  ): Message<T> {
    return {
      id: createId(),
      timestamp: new Date().toISOString(),
      type,
      source,
      target,
    };
  }

  /**
   * Create a message with payload
   */
  static createMessageWithPayload<T extends string, P>(
    type: T,
    payload: P,
    source?: string,
    target?: string,
  ): Message<T, P> {
    return {
      id: createId(),
      timestamp: new Date().toISOString(),
      type,
      payload,
      source,
      target,
    };
  }

  /**
   * Create an error response
   */
  static createErrorResponse(
    requestId: string,
    code: string,
    message: string,
  ): MessageResponse {
    return {
      id: createId(),
      requestId,
      success: false,
      error: {
        code,
        message,
      },
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Create a success response
   */
  static createSuccessResponse<T = unknown>(
    requestId: string,
    data?: T,
  ): MessageResponse {
    return {
      id: createId(),
      requestId,
      success: true,
      data,
      timestamp: new Date().toISOString(),
    };
  }
}
