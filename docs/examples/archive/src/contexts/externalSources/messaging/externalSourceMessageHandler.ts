/**
 * External Source Context Message Handler
 * 
 * This module provides message handling capabilities for the ExternalSourceContext,
 * allowing it to process request and notification messages from the
 * cross-context messaging system.
 * 
 * Implements the Component Interface Standardization pattern with:
 * - getInstance(): Returns the singleton instance
 * - resetInstance(): Resets the singleton instance (mainly for testing)
 * - createFresh(): Creates a new instance without affecting the singleton
 * - createWithDependencies(): Creates an instance with explicit dependencies
 * - createHandler(): Creates a message handler function (for backward compatibility)
 */

import { ContextId } from '@/protocol/core/contextOrchestrator';
import { 
  DataRequestType, 
  MessageFactory,
} from '@/protocol/messaging';
import type { 
  ContextMessage,
  DataRequestMessage,
  DataResponseMessage,
  NotificationMessage,
} from '@/protocol/messaging';
import { validateRequestParams } from '@/protocol/messaging/validation';
import { Logger } from '@/utils/logger';

import type { MCPExternalSourceContext } from '../MCPExternalSourceContext';
import type { 
  ExternalSourceSearchParams,
  ExternalSourceStatusParams,
} from '../schemas/messageSchemas';

/**
 * Handler for external source context messages
 */
export class ExternalSourceMessageHandler {
  /**
   * Singleton instance of ExternalSourceMessageHandler
   * This property should be accessed only by getInstance(), resetInstance(), and createFresh()
   */
  private static instance: ExternalSourceMessageHandler | null = null;
  
  /**
   * Logger instance for this class
   */
  private logger = Logger.getInstance();

  /**
   * Private constructor to enforce using factory methods
   * 
   * @param externalSourceContext The external source context to handle messages for
   */
  private constructor(private externalSourceContext: MCPExternalSourceContext) {}
  
  /**
   * Get the singleton instance of the handler
   * 
   * Part of the Component Interface Standardization pattern.
   * 
   * @param externalSourceContext The external source context to handle messages for
   * @returns The shared ExternalSourceMessageHandler instance
   */
  public static getInstance(externalSourceContext?: MCPExternalSourceContext): ExternalSourceMessageHandler {
    if (!ExternalSourceMessageHandler.instance && externalSourceContext) {
      ExternalSourceMessageHandler.instance = new ExternalSourceMessageHandler(externalSourceContext);
      
      const logger = Logger.getInstance();
      logger.debug('ExternalSourceMessageHandler singleton instance created');
    } else if (!ExternalSourceMessageHandler.instance) {
      throw new Error('ExternalSourceMessageHandler.getInstance() called without required externalSourceContext');
    } else if (externalSourceContext) {
      // Log a warning if trying to get instance with different dependencies
      const logger = Logger.getInstance();
      logger.warn('getInstance called with context but instance already exists. Context ignored.');
    }
    
    return ExternalSourceMessageHandler.instance;
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
      if (ExternalSourceMessageHandler.instance) {
        // Resource cleanup if needed
      }
    } catch (error) {
      const logger = Logger.getInstance();
      logger.error('Error during ExternalSourceMessageHandler instance reset:', error);
    } finally {
      ExternalSourceMessageHandler.instance = null;
      
      const logger = Logger.getInstance();
      logger.debug('ExternalSourceMessageHandler singleton instance reset');
    }
  }
  
  /**
   * Create a fresh handler instance
   * 
   * Part of the Component Interface Standardization pattern.
   * Creates a new instance without affecting the singleton instance.
   * Primarily used for testing.
   * 
   * @param externalSourceContext The external source context to handle messages for
   * @returns A new ExternalSourceMessageHandler instance
   */
  public static createFresh(externalSourceContext: MCPExternalSourceContext): ExternalSourceMessageHandler {
    const logger = Logger.getInstance();
    logger.debug('Creating fresh ExternalSourceMessageHandler instance');
    
    return new ExternalSourceMessageHandler(externalSourceContext);
  }
  
  /**
   * Create a new handler instance with explicit dependencies
   * 
   * Part of the Component Interface Standardization pattern.
   * Uses the configOrDependencies pattern for flexible dependency injection.
   * 
   * @param configOrDependencies Configuration or explicit dependencies
   * @returns A new ExternalSourceMessageHandler instance with the provided dependencies
   */
  public static createWithDependencies(
    configOrDependencies: Record<string, unknown> = {},
  ): ExternalSourceMessageHandler {
    const logger = Logger.getInstance();
    logger.debug('Creating ExternalSourceMessageHandler with dependencies');
    
    // Handle the case where dependencies are explicitly provided
    if ('externalSourceContext' in configOrDependencies) {
      const externalSourceContext = configOrDependencies['externalSourceContext'] as MCPExternalSourceContext;
      return new ExternalSourceMessageHandler(externalSourceContext);
    }
    
    // Cannot create without an external source context
    throw new Error('ExternalSourceMessageHandler requires an externalSourceContext dependency');
  }
  
  /**
   * Create a message handler for the external source context
   * 
   * This is the original functionality, maintained for backward compatibility.
   * 
   * @param externalSourceContext The external source context to handle messages for
   * @returns Message handler function
   */
  static createHandler(externalSourceContext: MCPExternalSourceContext) {
    return async (message: ContextMessage): Promise<DataResponseMessage> => {
      const handler = new ExternalSourceMessageHandler(externalSourceContext);
      
      if (message.category === 'request' && 'dataType' in message) {
        return handler.handleRequest(message as DataRequestMessage);
      } else if (message.category === 'notification' && 'notificationType' in message) {
        await handler.handleNotification(message as NotificationMessage);
        
        // Create a success response as an acknowledgment for the notification
        // This meets the DataResponseMessage interface requirements
        return MessageFactory.createSuccessResponse(
          ContextId.EXTERNAL_SOURCES,
          message.sourceContext || '*',
          message.id || 'unknown',
          {
            acknowledged: true,
            message: 'Notification processed',
          },
        );
      }
      
      // Default return value for unrecognized message format
      return MessageFactory.createErrorResponse(
        ContextId.EXTERNAL_SOURCES,
        message.sourceContext || '*',
        message.id || 'unknown',
        'INVALID_MESSAGE_FORMAT',
        'Message format not recognized',
      );
    };
  }
  
  /**
   * Handle data request messages
   * This exposed public method is used by the ContextMessaging wrapper
   * 
   * @param request Data request message
   * @returns Response message
   */
  public async handleRequest(request: DataRequestMessage): Promise<DataResponseMessage> {
    const dataType = request.dataType;
    
    switch (dataType) {
    case DataRequestType.EXTERNAL_SOURCES:
      return this.handleExternalSearch(request);
      
    case 'externalSources.status':
      return this.handleExternalSourceStatus(request);
      
    default:
      return MessageFactory.createErrorResponse(
        ContextId.EXTERNAL_SOURCES,
        request.sourceContext,
        request.id,
        'UNSUPPORTED_DATA_TYPE',
        `Unsupported data type: ${request.dataType}`,
      );
    }
  }
  
  /**
   * Handle notification messages
   * 
   * @param notification Notification message
   */
  public async handleNotification(notification: NotificationMessage): Promise<void> {
    const notificationType = notification.notificationType;
    
    switch (notificationType) {
    case 'query.submitted':
      this.logger.debug('External source context received query notification');
      // Could trigger a search in external sources
      break;
      
    default:
      this.logger.debug(`External source context received unhandled notification type: ${notificationType}`);
      break;
    }
  }
  
  /**
   * Handle external search request
   * 
   * @param request Data request message for external search
   * @returns Response message
   */
  private async handleExternalSearch(request: DataRequestMessage): Promise<DataResponseMessage> {
    try {
      // Validate parameters using schema
      const validation = validateRequestParams<ExternalSourceSearchParams>(request);
      
      if (!validation.success || !validation.data) {
        return MessageFactory.createErrorResponse(
          ContextId.EXTERNAL_SOURCES,
          request.sourceContext,
          request.id,
          'VALIDATION_ERROR',
          validation.errorMessage || 'Invalid parameters',
        );
      }
      
      // With this guard, TypeScript knows validation.data is defined
      const { query, limit, includeEmbeddings } = validation.data;
      
      // Perform search with validated parameters
      const results = await this.externalSourceContext.search(query, { 
        limit: limit,
        addEmbeddings: includeEmbeddings,
      });
      
      return MessageFactory.createSuccessResponse(
        ContextId.EXTERNAL_SOURCES,
        request.sourceContext,
        request.id,
        { results },
      );
    } catch (error) {
      return MessageFactory.createErrorResponse(
        ContextId.EXTERNAL_SOURCES,
        request.sourceContext,
        request.id,
        'SEARCH_ERROR',
        `Error searching external sources: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
  
  /**
   * Handle external source status request
   * 
   * @param request Data request message for external source status
   * @returns Response message
   */
  private async handleExternalSourceStatus(request: DataRequestMessage): Promise<DataResponseMessage> {
    try {
      // Validate parameters using schema
      const validation = validateRequestParams<ExternalSourceStatusParams>(request);
      
      if (!validation.success || !validation.data) {
        return MessageFactory.createErrorResponse(
          ContextId.EXTERNAL_SOURCES,
          request.sourceContext,
          request.id,
          'VALIDATION_ERROR',
          validation.errorMessage || 'Invalid parameters',
        );
      }
      
      // With this guard, TypeScript knows validation.data is defined
      // We don't need any parameters for the basic availability check
      
      // Check availability of all sources
      const availability = await this.externalSourceContext.checkSourcesAvailability();
      
      // Transform the availability data to the expected response format
      const sources = Object.entries(availability).map(([name, isAvailable]) => {
        // Create source object with required properties
        return { 
          name, 
          isAvailable, 
        };
      });
      
      return MessageFactory.createSuccessResponse(
        ContextId.EXTERNAL_SOURCES,
        request.sourceContext,
        request.id,
        { sources },
      );
    } catch (error) {
      return MessageFactory.createErrorResponse(
        ContextId.EXTERNAL_SOURCES,
        request.sourceContext,
        request.id,
        'STATUS_ERROR',
        `Error getting external source status: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}