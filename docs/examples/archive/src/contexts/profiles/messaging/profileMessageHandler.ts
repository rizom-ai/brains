/**
 * Profile Message Handler
 * 
 * Handles incoming messages for ProfileContext from other contexts.
 */

import type { MCPProfileContext } from '@/contexts/profiles';
import { ContextId } from '@/protocol/core/contextOrchestrator';
import { MessageFactory } from '@/protocol/messaging/messageFactory';
import { 
  type ContextCommunicationMessage, 
  type DataRequestMessage, 
  DataRequestType,
  type DataResponseMessage,
  type NotificationMessage,
} from '@/protocol/messaging/messageTypes';
import { validateRequestParams } from '@/protocol/messaging/validation';
import { Logger } from '@/utils/logger';

import type { ProfileDataParams } from '../schemas/messageSchemas';

/**
 * Options for ProfileMessageHandler
 */
export interface ProfileMessageHandlerOptions {
  profileContext?: MCPProfileContext;
}

/**
 * Handles incoming messages for ProfileContext
 */
export class ProfileMessageHandler {
  private static instance: ProfileMessageHandler | null = null;
  
  /** MCP Profile context */
  private profileContext: MCPProfileContext;
  
  /** Logger instance */
  private logger: Logger;
  
  /**
   * Private constructor to enforce getInstance() usage
   */
  private constructor(
    profileContext: MCPProfileContext,
  ) {
    this.profileContext = profileContext;
    this.logger = Logger.getInstance();
    
    this.logger.debug('ProfileMessageHandler initialized', { context: 'ProfileMessageHandler' });
  }
  
  /**
   * Get the singleton instance
   * 
   * @param profileContext Profile context
   * @returns The singleton instance
   */
  public static getInstance(
    profileContext: MCPProfileContext,
  ): ProfileMessageHandler {
    if (!ProfileMessageHandler.instance) {
      ProfileMessageHandler.instance = new ProfileMessageHandler(
        profileContext,
      );
    }
    return ProfileMessageHandler.instance;
  }
  
  /**
   * Reset the singleton instance
   * This is primarily used for testing
   */
  public static resetInstance(): void {
    ProfileMessageHandler.instance = null;
  }
  
  /**
   * Create a fresh instance without affecting the singleton
   * 
   * @param options Configuration options
   * @returns A new instance
   */
  public static createFresh(options: ProfileMessageHandlerOptions): ProfileMessageHandler {
    if (!options.profileContext) {
      throw new Error('Profile context is required');
    }
    
    return new ProfileMessageHandler(
      options.profileContext,
    );
  }
  
  /**
   * Handle an incoming message
   * 
   * @param message The message to handle
   * @returns Response message or void
   */
  public async handleMessage(message: ContextCommunicationMessage): Promise<ContextCommunicationMessage | void> {
    if (message.category === 'request') {
      return await this.handleRequest(message as DataRequestMessage);
    } else if (message.category === 'notification') {
      await this.handleNotification(message as NotificationMessage);
      // Return acknowledgment for notifications
      return MessageFactory.createAcknowledgment(
        ContextId.PROFILE,
        message.sourceContext,
        message.id,
        'processed',
      );
    }
    
    // Return error for unrecognized message format
    return MessageFactory.createErrorResponse(
      ContextId.PROFILE,
      message.sourceContext,
      message.id,
      'INVALID_MESSAGE_FORMAT',
      'Message format not recognized',
    );
  }

  /**
   * Handle a data request message
   * 
   * @param message Data request message
   * @returns Response message
   */
  private async handleRequest(message: DataRequestMessage): Promise<DataResponseMessage> {
    try {
      this.logger.debug('Handling profile context request', { 
        requestType: message.dataType,
        context: 'ProfileMessageHandler', 
      });
      
      // Check if this is a valid data request
      if (!message.dataType) {
        this.logger.error('Invalid data request message', { message, context: 'ProfileMessageHandler' });
        return MessageFactory.createErrorResponse(
          message.id,
          message.sourceContext,
          message.targetContext,
          'Invalid data request message',
          'VALIDATION_ERROR',
        );
      }
      
      // Handle different request types
      switch (message.dataType) {
      case DataRequestType.PROFILE_DATA:
        return await this.handleGetProfile(message);
        
      default:
        this.logger.warn('Unhandled request type', { 
          requestType: message.dataType,
          context: 'ProfileMessageHandler', 
        });
        return MessageFactory.createErrorResponse(
          message.id,
          message.sourceContext,
          message.targetContext,
          `Unsupported request type: ${message.dataType}`,
          'UNSUPPORTED_DATA_TYPE',
        );
      }
    } catch (error) {
      this.logger.error('Error handling profile context request', { error, context: 'ProfileMessageHandler' });
      
      return MessageFactory.createErrorResponse(
        message.id,
        message.sourceContext,
        message.targetContext,
        'Error handling request',
        'INTERNAL_ERROR',
      );
    }
  }
  
  /**
   * Handle a notification message
   * 
   * @param message Notification message
   */
  private async handleNotification(message: NotificationMessage): Promise<void> {
    try {
      this.logger.debug('Handling profile context notification', { 
        notificationType: message.notificationType,
        context: 'ProfileMessageHandler', 
      });
      
      // Check if this is a valid notification
      if (!message.notificationType) {
        this.logger.error('Invalid notification message', { message, context: 'ProfileMessageHandler' });
        return;
      }
      
      // Handle different notification types
      switch (message.notificationType) {
      // Add specific notification handlers if needed
      default:
        this.logger.debug('Ignoring notification type', { 
          notificationType: message.notificationType,
          context: 'ProfileMessageHandler', 
        });
        break;
      }
    } catch (error) {
      this.logger.error('Error handling profile context notification', { error, context: 'ProfileMessageHandler' });
    }
  }
  
  /**
   * Handle a get profile request
   * 
   * @param message Get profile request message
   * @returns Response with profile data
   */
  private async handleGetProfile(message: DataRequestMessage): Promise<DataResponseMessage> {
    try {
      // Validate parameters using schema
      const validation = validateRequestParams<ProfileDataParams>(message);
      
      if (!validation.success) {
        return MessageFactory.createErrorResponse(
          message.id,
          ContextId.PROFILE,
          message.sourceContext,
          validation.errorMessage || 'Invalid parameters',
          'VALIDATION_ERROR',
        );
      }
      
      // No parameters to extract here, as the profile request doesn't need any
      const profile = await this.profileContext.getProfile();
      
      if (!profile) {
        return MessageFactory.createErrorResponse(
          message.id,
          ContextId.PROFILE,
          message.sourceContext,
          'Profile not found',
          'PROFILE_NOT_FOUND',
        );
      }
      
      return MessageFactory.createSuccessResponse(
        ContextId.PROFILE,
        message.sourceContext,
        message.id,
        { profile },
      );
    } catch (error) {
      this.logger.error('Error handling get profile request', { error, context: 'ProfileMessageHandler' });
      return MessageFactory.createErrorResponse(
        message.id,
        message.sourceContext,
        message.targetContext,
        `Error retrieving profile: ${error instanceof Error ? error.message : String(error)}`,
        'READ_ERROR',
      );
    }
  }
}