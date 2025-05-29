/**
 * Note Context Message Handler
 * 
 * This module provides message handling capabilities for the NoteContext,
 * allowing it to process request and notification messages from the
 * cross-context messaging system.
 */

import { ContextId } from '@/protocol/core/contextOrchestrator';
import { DataRequestType, MessageFactory, NotificationType } from '@/protocol/messaging';
import type { ContextCommunicationMessage, DataRequestMessage, NotificationMessage } from '@/protocol/messaging';
import { validateRequestParams } from '@/protocol/messaging/validation';
import { Logger } from '@/utils/logger';

import type { MCPNoteContext } from '../MCPNoteContext';
import type { 
  NoteByIdParams,
  NotesSearchParams,
  NotesSemanticSearchParams,
} from '../schemas/messageSchemas';

/**
 * Handler for note context messages
 * 
 * Implements the Component Interface Standardization pattern with:
 * - getInstance(): Returns the singleton instance
 * - resetInstance(): Resets the singleton instance (mainly for testing)
 * - createFresh(): Creates a new instance without affecting the singleton
 * - createWithDependencies(): Creates an instance with explicit dependencies
 * - createHandler(): Creates a message handler function (original functionality)
 */
export class NoteMessageHandler {
  /**
   * Singleton instance of NoteMessageHandler
   * This property should be accessed only by getInstance(), resetInstance(), and createFresh()
   */
  private static instance: NoteMessageHandler | null = null;
  
  /**
   * Logger instance for this class
   */
  private logger = Logger.getInstance();
  
  /**
   * Get the singleton instance of the handler
   * 
   * Part of the Component Interface Standardization pattern.
   * 
   * @param noteContext The note context to handle messages for
   * @returns The shared NoteMessageHandler instance
   */
  public static getInstance(noteContext?: MCPNoteContext): NoteMessageHandler {
    if (!NoteMessageHandler.instance && noteContext) {
      NoteMessageHandler.instance = new NoteMessageHandler(noteContext);
      
      const logger = Logger.getInstance();
      logger.debug('NoteMessageHandler singleton instance created');
    } else if (!NoteMessageHandler.instance) {
      throw new Error('NoteMessageHandler.getInstance() called without required noteContext');
    } else if (noteContext) {
      // Log a warning if trying to get instance with different dependencies
      const logger = Logger.getInstance();
      logger.warn('getInstance called with context but instance already exists. Context ignored.');
    }
    
    return NoteMessageHandler.instance;
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
      if (NoteMessageHandler.instance) {
        // Resource cleanup if needed
      }
    } catch (error) {
      const logger = Logger.getInstance();
      logger.error('Error during NoteMessageHandler instance reset:', error);
    } finally {
      NoteMessageHandler.instance = null;
      
      const logger = Logger.getInstance();
      logger.debug('NoteMessageHandler singleton instance reset');
    }
  }
  
  /**
   * Create a fresh handler instance
   * 
   * Part of the Component Interface Standardization pattern.
   * Creates a new instance without affecting the singleton instance.
   * Primarily used for testing.
   * 
   * @param noteContext The note context to handle messages for
   * @returns A new NoteMessageHandler instance
   */
  public static createFresh(noteContext: MCPNoteContext): NoteMessageHandler {
    const logger = Logger.getInstance();
    logger.debug('Creating fresh NoteMessageHandler instance');
    
    return new NoteMessageHandler(noteContext);
  }
  
  /**
   * Create a new handler instance with explicit dependencies
   * 
   * Part of the Component Interface Standardization pattern.
   * 
   * @param noteContext The note context to handle messages for
   * @returns A new NoteMessageHandler instance with the provided dependencies
   */
  public static createWithDependencies(
    noteContext: MCPNoteContext,
  ): NoteMessageHandler {
    const logger = Logger.getInstance();
    logger.debug('Creating NoteMessageHandler with dependencies');
    
    return new NoteMessageHandler(noteContext);
  }
  
  /**
   * Create a message handler for the note context
   * 
   * This is the original functionality, maintained for backward compatibility.
   * 
   * @param noteContext The note context to handle messages for
   * @returns Message handler function
   */
  static createHandler(noteContext: MCPNoteContext) {
    return async (message: ContextCommunicationMessage) => {
      const handler = new NoteMessageHandler(noteContext);
      
      if (message.category === 'request' && 'dataType' in message) {
        return handler.handleRequest(message);
      } else if (message.category === 'notification' && 'notificationType' in message) {
        await handler.handleNotification(message);
        // Return acknowledgment for notifications
        return MessageFactory.createAcknowledgment(
          ContextId.NOTES,
          message.sourceContext,
          message.id,
          'processed',
        );
      }
      
      // Return error for unrecognized message format
      return MessageFactory.createErrorResponse(
        ContextId.NOTES,
        message.sourceContext,
        message.id,
        'INVALID_MESSAGE_FORMAT',
        'Message format not recognized',
      );
    };
  }
  
  /**
   * Private constructor to enforce using factory methods
   * 
   * @param noteContext The note context to handle messages for
   */
  private constructor(private noteContext: MCPNoteContext) {}
  
  /** 
   * Handle data request messages
   * This exposed public method is used by the ContextMessaging wrapper
   * 
   * @param request Data request message
   * @returns Response message
   */
  public async handleRequest(request: DataRequestMessage) {
    const dataType = request.dataType;
    
    switch (dataType) {
    case DataRequestType.NOTES_SEARCH:
      return this.handleNotesSearch(request);
        
    case DataRequestType.NOTE_BY_ID:
      return this.handleNoteById(request);
    
    case DataRequestType.NOTES_SEMANTIC_SEARCH:
      return this.handleNoteSemanticSearch(request);
      
    default:
      return MessageFactory.createErrorResponse(
        ContextId.NOTES,
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
    const notificationType = notification.notificationType;
    
    switch (notificationType) {
    case NotificationType.PROFILE_UPDATED:
      this.logger.debug('Note context received profile update notification');
      // Could update note templates or default tags based on profile
      break;
        
    case NotificationType.CONVERSATION_STARTED:
      this.logger.debug('Note context received conversation start notification');
      // Could prepare note storage or context for conversation
      break;
        
    default:
      this.logger.debug(`Note context received unhandled notification type: ${notificationType}`);
      break;
    }
  }
  
  /**
   * Handle notes search request
   * 
   * @param request Data request message
   * @returns Response message
   */
  private async handleNotesSearch(request: DataRequestMessage) {
    try {
      // Validate parameters using schema
      const validation = validateRequestParams<NotesSearchParams>(request);
      
      if (!validation.success) {
        return MessageFactory.createErrorResponse(
          request.id,
          ContextId.NOTES,
          request.sourceContext,
          validation.errorMessage || 'Invalid parameters',
          'VALIDATION_ERROR',
        );
      }
      
      // Now we have type-safe access to the validated parameters
      const { query, limit, includeContent } = validation.data ?? {};
      
      // Create a search options object
      const searchOptions = {
        query,
        limit,
        includeContent,
        semanticSearch: true, 
      };
      
      // Search notes using the options object
      const notes = await this.noteContext.searchNotes(searchOptions);
      
      return MessageFactory.createSuccessResponse(
        ContextId.NOTES,
        request.sourceContext,
        request.id,
        { notes },
      );
    } catch (error) {
      return MessageFactory.createErrorResponse(
        ContextId.NOTES,
        request.sourceContext,
        request.id,
        'SEARCH_ERROR',
        `Error searching notes: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
  
  /**
   * Handle get note by ID request
   * 
   * @param request Data request message
   * @returns Response message
   */
  private async handleNoteById(request: DataRequestMessage) {
    try {
      // Validate parameters using schema
      const validation = validateRequestParams<NoteByIdParams>(request);
      
      if (!validation.success) {
        return MessageFactory.createErrorResponse(
          request.id,
          ContextId.NOTES,
          request.sourceContext,
          validation.errorMessage || 'Invalid parameters',
          'VALIDATION_ERROR',
        );
      }
      
      // Now we have type-safe access to the validated parameters
      const { id } = validation.data ?? {};
      
      // Ensure id is not undefined
      if (!id) {
        return MessageFactory.createErrorResponse(
          request.id,
          ContextId.NOTES,
          request.sourceContext,
          'Note ID is required',
          'VALIDATION_ERROR',
        );
      }
      
      const note = await this.noteContext.getNoteById(id);
      
      if (!note) {
        return MessageFactory.createErrorResponse(
          request.id,
          ContextId.NOTES,
          request.sourceContext,
          `Note with ID ${id} not found`,
          'NOTE_NOT_FOUND',
        );
      }
      
      return MessageFactory.createSuccessResponse(
        ContextId.NOTES,
        request.sourceContext,
        request.id,
        { note },
      );
    } catch (error) {
      return MessageFactory.createErrorResponse(
        ContextId.NOTES,
        request.sourceContext,
        request.id,
        'READ_ERROR',
        `Error retrieving note: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
  
  /**
   * Handle semantic search request for notes
   * 
   * @param request Data request message
   * @returns Response message with search results
   */
  private async handleNoteSemanticSearch(request: DataRequestMessage) {
    try {
      // Validate parameters using schema
      const validation = validateRequestParams<NotesSemanticSearchParams>(request);
      
      if (!validation.success) {
        return MessageFactory.createErrorResponse(
          request.id,
          ContextId.NOTES,
          request.sourceContext,
          validation.errorMessage || 'Invalid parameters',
          'VALIDATION_ERROR',
        );
      }
      
      // Now we have type-safe access to the validated parameters
      const { text, limit, tags } = validation.data ?? {};
      
      // Ensure text is not undefined
      if (!text) {
        return MessageFactory.createErrorResponse(
          request.id,
          ContextId.NOTES,
          request.sourceContext,
          'Search text is required',
          'VALIDATION_ERROR',
        );
      }
      
      // Use the searchWithEmbedding method
      const notes = await this.noteContext.searchWithEmbedding(text, limit, tags);
      
      return MessageFactory.createSuccessResponse(
        ContextId.NOTES,
        request.sourceContext,
        request.id,
        { notes },
      );
    } catch (error) {
      return MessageFactory.createErrorResponse(
        ContextId.NOTES,
        request.sourceContext,
        request.id,
        'SEARCH_ERROR',
        `Error in semantic search: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}