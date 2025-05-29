/**
 * Message Factory
 * 
 * Factory for creating standardized context communication messages.
 * This ensures all messages follow the same format and contain required fields.
 */

import { v4 as uuidv4 } from 'uuid';

import type { 
  AcknowledgmentMessage, 
  ContextMessage, 
  DataRequestMessage, 
  DataResponseMessage, 
  NotificationMessage, 
} from './messageTypes';
import type { DataRequestType, NotificationType } from './messageTypes';

/**
 * Factory for creating context communication messages
 */
export class MessageFactory {
  /**
   * Create a base context message with common fields
   * 
   * @param sourceContext Source context identifier
   * @param targetContext Target context identifier
   * @param category Message category
   * @returns Base message with common fields
   */
  private static createBaseMessage(
    sourceContext: string, 
    targetContext: string,
    category: 'request' | 'response' | 'notification',
  ): ContextMessage {
    return {
      id: uuidv4(),
      timestamp: new Date(),
      type: 'context',
      source: 'context-system',
      target: targetContext,
      sourceContext,
      targetContext,
      category,
    };
  }
  
  /**
   * Create a data request message
   * 
   * @param sourceContext Source context identifier
   * @param targetContext Target context identifier
   * @param dataType Type of data being requested
   * @param parameters Optional query parameters
   * @param timeout Optional timeout in milliseconds
   * @returns Data request message
   */
  static createDataRequest(
    sourceContext: string,
    targetContext: string,
    dataType: string | DataRequestType,
    parameters?: Record<string, unknown>,
    timeout?: number,
  ): DataRequestMessage {
    return {
      ...this.createBaseMessage(sourceContext, targetContext, 'request'),
      category: 'request',
      dataType,
      parameters,
      timeout,
    };
  }
  
  /**
   * Create a successful data response message
   * 
   * @param sourceContext Source context identifier
   * @param targetContext Target context identifier
   * @param requestId ID of the request being responded to
   * @param data Response data
   * @returns Data response message
   */
  /**
   * Create a data response with typed data
   * 
   * @param requestId ID of the request being responded to
   * @param sourceContext Source context identifier
   * @param targetContext Target context identifier
   * @param dataType Type of data being requested
   * @param data The data to return
   * @returns Data response message
   */
  static createDataResponse<T>(
    requestId: string,
    sourceContext: string,
    targetContext: string,
    dataType: string | DataRequestType,
    data: T,
  ): DataResponseMessage {
    return {
      ...this.createBaseMessage(targetContext, sourceContext, 'response'),
      category: 'response',
      requestId,
      status: 'success',
      data: { data, dataType },
    };
  }
  
  static createSuccessResponse(
    sourceContext: string,
    targetContext: string,
    requestId: string,
    data: Record<string, unknown>,
  ): DataResponseMessage {
    return {
      ...this.createBaseMessage(sourceContext, targetContext, 'response'),
      category: 'response',
      requestId,
      status: 'success',
      data,
    };
  }
  
  /**
   * Create an error data response message
   * 
   * @param sourceContext Source context identifier
   * @param targetContext Target context identifier
   * @param requestId ID of the request being responded to
   * @param errorCode Error code
   * @param errorMessage Error message
   * @param details Optional error details
   * @returns Data response message
   */
  static createErrorResponse(
    requestId: string,
    sourceContext: string,
    targetContext: string,
    errorMessage: string,
    errorCode: string = 'ERROR',
    details?: Record<string, unknown>,
  ): DataResponseMessage {
    return {
      ...this.createBaseMessage(sourceContext, targetContext, 'response'),
      category: 'response',
      requestId,
      status: 'error',
      error: {
        code: errorCode,
        message: errorMessage,
        details,
      },
    };
  }
  
  /**
   * Create a notification message
   * 
   * @param sourceContext Source context identifier
   * @param targetContext Target context identifier or '*' for broadcast
   * @param notificationType Type of notification
   * @param payload Notification data
   * @param requiresAck Whether acknowledgment is required
   * @returns Notification message
   */
  static createNotification(
    sourceContext: string,
    targetContext: string,
    notificationType: string | NotificationType,
    payload: Record<string, unknown>,
    requiresAck: boolean = false,
  ): NotificationMessage {
    return {
      ...this.createBaseMessage(sourceContext, targetContext, 'notification'),
      category: 'notification',
      notificationType,
      payload,
      requiresAck,
    };
  }
  
  /**
   * Create an acknowledgment message
   * 
   * @param sourceContext Source context identifier
   * @param targetContext Target context identifier
   * @param notificationId ID of the notification being acknowledged
   * @param status Acknowledgment status
   * @param message Optional message
   * @returns Acknowledgment message
   */
  static createAcknowledgment(
    sourceContext: string,
    targetContext: string,
    notificationId: string,
    status: 'received' | 'processed' | 'rejected',
    message?: string,
  ): AcknowledgmentMessage {
    return {
      ...this.createBaseMessage(sourceContext, targetContext, 'response'),
      category: 'response',
      notificationId,
      status,
      message,
    };
  }
}