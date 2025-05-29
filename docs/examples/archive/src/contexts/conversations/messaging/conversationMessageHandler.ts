/**
 * Conversation Context Message Handler
 * 
 * This module provides message handling capabilities for the ConversationContext,
 * allowing it to process request and notification messages from the
 * cross-context messaging system.
 */

import { ContextId } from '@/protocol/core/contextOrchestrator';
import { 
  type DataRequestMessage, 
  DataRequestType, 
  MessageFactory,
  type NotificationMessage,
  NotificationType, 
} from '@/protocol/messaging';
import { validateRequestParams } from '@/protocol/messaging/validation';
import { Logger } from '@/utils/logger';

import type { MCPConversationContext } from '../MCPConversationContext';
import type { ConversationHistoryParams } from '../schemas/messageSchemas';

/**
 * Interface for message with common properties
 */
interface BaseContextMessage {
  category: string;
  sourceContext?: string;
  id?: string;
}

/**
 * Handler for conversation context messages
 * 
 * Implements the Component Interface Standardization pattern with:
 * - getInstance(): Returns the singleton instance
 * - resetInstance(): Resets the singleton instance (mainly for testing)
 * - createFresh(): Creates a new instance without affecting the singleton
 * - createWithDependencies(): Creates an instance with explicit dependencies
 * - createHandler(): Creates a message handler function (original functionality)
 */
export class ConversationMessageHandler {
  /**
   * Singleton instance of ConversationMessageHandler
   * This property should be accessed only by getInstance(), resetInstance(), and createFresh()
   */
  private static instance: ConversationMessageHandler | null = null;
  
  /**
   * Logger instance for this class
   */
  private logger = Logger.getInstance();
  
  /**
   * Get the singleton instance of the handler
   * 
   * Part of the Component Interface Standardization pattern.
   * 
   * @param conversationContext The conversation context to handle messages for
   * @returns The shared ConversationMessageHandler instance
   */
  public static getInstance(conversationContext?: MCPConversationContext): ConversationMessageHandler {
    if (!ConversationMessageHandler.instance && conversationContext) {
      ConversationMessageHandler.instance = new ConversationMessageHandler(conversationContext);
      
      const logger = Logger.getInstance();
      logger.debug('ConversationMessageHandler singleton instance created');
    } else if (!ConversationMessageHandler.instance) {
      throw new Error('ConversationMessageHandler.getInstance() called without required conversationContext');
    } else if (conversationContext) {
      // Log a warning if trying to get instance with different dependencies
      const logger = Logger.getInstance();
      logger.warn('getInstance called with context but instance already exists. Context ignored.');
    }
    
    return ConversationMessageHandler.instance;
  }
  
  /**
   * Reset the singleton instance
   * 
   * Part of the Component Interface Standardization pattern.
   * Primarily used for testing to ensure a clean state.
   */
  public static resetInstance(): void {
    try {
      // No specific cleanup needed for this handler
      if (ConversationMessageHandler.instance) {
        // Resource cleanup if needed
      }
    } catch (error) {
      const logger = Logger.getInstance();
      logger.error('Error during ConversationMessageHandler instance reset:', error);
    } finally {
      ConversationMessageHandler.instance = null;
      
      const logger = Logger.getInstance();
      logger.debug('ConversationMessageHandler singleton instance reset');
    }
  }
  
  /**
   * Create a fresh handler instance
   * 
   * Part of the Component Interface Standardization pattern.
   * Creates a new instance without affecting the singleton instance.
   * Primarily used for testing.
   * 
   * @param conversationContext The conversation context to handle messages for
   * @returns A new ConversationMessageHandler instance
   */
  public static createFresh(conversationContext: MCPConversationContext): ConversationMessageHandler {
    const logger = Logger.getInstance();
    logger.debug('Creating fresh ConversationMessageHandler instance');
    
    return new ConversationMessageHandler(conversationContext);
  }
  
  /**
   * Create a new handler instance with explicit dependencies
   * 
   * TODO: This method follows the old Component Interface Standardization pattern
   * and should be removed or simplified for MCP contexts.
   * 
   * @param configOrDependencies Configuration or explicit dependencies
   * @returns A new ConversationMessageHandler instance with the provided dependencies
   */
  public static createWithDependencies(
    configOrDependencies: Record<string, unknown> = {},
  ): ConversationMessageHandler {
    const logger = Logger.getInstance();
    logger.debug('Creating ConversationMessageHandler with dependencies');
    
    // Handle the case where dependencies are explicitly provided
    if ('conversationContext' in configOrDependencies) {
      const conversationContext = configOrDependencies['conversationContext'] as MCPConversationContext;
      return new ConversationMessageHandler(conversationContext);
    }
    
    // Cannot create without a conversation context
    throw new Error('ConversationMessageHandler requires a conversationContext dependency');
  }
  
  /**
   * Create a message handler function for the conversation context
   * 
   * TODO: This method should be updated or removed for MCP contexts.
   * 
   * @param conversationContext The conversation context to handle messages for
   * @returns Message handler function
   */
  static createHandler(conversationContext: MCPConversationContext) {
    return async (message: BaseContextMessage) => {
      const handler = new ConversationMessageHandler(conversationContext);
      
      if (message.category === 'request' && 'dataType' in message) {
        return handler.handleRequest(message as DataRequestMessage);
      } else if (message.category === 'notification' && 'notificationType' in message) {
        await handler.handleNotification(message as NotificationMessage);
        // Return acknowledgment for notifications
        return MessageFactory.createAcknowledgment(
          ContextId.CONVERSATION,
          message.sourceContext || '*',
          message.id || 'unknown',
          'processed',
        );
      }
      
      // Return error for unrecognized message format
      return MessageFactory.createErrorResponse(
        ContextId.CONVERSATION,
        message.sourceContext || '*',
        message.id || 'unknown',
        'INVALID_MESSAGE_FORMAT',
        'Message format not recognized',
      );
    };
  }
  
  /**
   * Private constructor to enforce using factory methods
   * 
   * @param conversationContext The conversation context to handle messages for
   */
  private constructor(private conversationContext: MCPConversationContext) {}
  
  /**
   * Handle data request messages
   * This exposed public method is used by the ContextMessaging wrapper
   * 
   * @param request Data request message
   * @returns Response message
   */
  public async handleRequest(request: DataRequestMessage) {
    const dataType = request.dataType as DataRequestType;
    
    switch (dataType) {
    case DataRequestType.CONVERSATION_HISTORY:
      return this.handleConversationHistory(request);
        
    default:
      return MessageFactory.createErrorResponse(
        ContextId.CONVERSATION,
        request.sourceContext,
        request.id,
        'UNSUPPORTED_DATA_TYPE',
        `Unsupported data type: ${request.dataType}`,
      );
    }
  }
  
  /**
   * Handle notification messages
   * This exposed public method is used by the ContextMessaging wrapper
   * 
   * @param notification Notification message
   */
  public async handleNotification(notification: NotificationMessage) {
    const notificationType = notification.notificationType as NotificationType;
    
    switch (notificationType) {
    case NotificationType.NOTE_CREATED:
      this.logger.debug('Conversation context received note created notification');
      // Process new note if needed
      break;
        
    default:
      this.logger.debug(`Conversation context received unhandled notification type: ${notificationType}`);
      break;
    }
  }
  
  /**
   * Handle conversation history request
   * 
   * @param request Data request message
   * @returns Response message
   */
  private async handleConversationHistory(request: DataRequestMessage) {
    try {
      // Validate parameters using schema
      const validation = validateRequestParams<ConversationHistoryParams>(request);
      
      if (!validation.success) {
        return MessageFactory.createErrorResponse(
          ContextId.CONVERSATION,
          request.sourceContext,
          request.id,
          'VALIDATION_ERROR',
          validation.errorMessage || 'Invalid parameters',
        );
      }
      
      // Extract parameters from validated data - validation.data is always defined when success is true
      const data = validation.data as ConversationHistoryParams;
      const { conversationId, limit } = data;
      
      // Use formatHistoryForPrompt method since MCPConversationContext doesn't have getConversationHistory
      const history = await this.conversationContext.formatHistoryForPrompt(
        conversationId,
        limit,
      );
      
      return MessageFactory.createSuccessResponse(
        ContextId.CONVERSATION,
        request.sourceContext,
        request.id,
        { history },
      );
    } catch (error) {
      return MessageFactory.createErrorResponse(
        ContextId.CONVERSATION,
        request.sourceContext,
        request.id,
        'HISTORY_ERROR',
        `Error retrieving conversation history: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}