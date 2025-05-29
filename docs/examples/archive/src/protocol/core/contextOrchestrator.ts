/**
 * Context Orchestrator with Messaging Support
 * 
 * Coordinates interactions between different contexts in the system.
 * This class is responsible for managing access to contexts, initializing them,
 * and ensuring they can communicate with each other using the messaging system.
 * 
 * Implements the Component Interface Standardization pattern with:
 * - getInstance(): Returns the singleton instance
 * - resetInstance(): Resets the singleton instance (mainly for testing)
 * - createFresh(): Creates a new instance without affecting the singleton
 */

import type {
  MCPConversationContext,
  MCPExternalSourceContext,
  MCPNoteContext,
  MCPProfileContext,
  MCPWebsiteContext,
} from '@/contexts';
import { Logger } from '@/utils/logger';

import type { BrainProtocolConfig } from '../config/brainProtocolConfig';
import { ContextManager } from '../managers/contextManager';
import { ContextMediator, type MessageHandler } from '../messaging/contextMediator';
import { MessageFactory } from '../messaging/messageFactory';
import { DataRequestType, NotificationType } from '../messaging/messageTypes';

/**
 * Context identifiers for registered contexts
 */
export enum ContextId {
  NOTES = 'notes-context',
  PROFILE = 'profile-context',
  CONVERSATION = 'conversation-context',
  EXTERNAL_SOURCES = 'external-sources-context',
  WEBSITE = 'website-context',
  ALL = '*', // Special value to target all contexts
}

/**
 * Configuration options for ContextOrchestrator
 */
export interface ContextOrchestratorOptions {
  /** Configuration for the orchestrator */
  config: BrainProtocolConfig;
  /** Optional context mediator for messaging */
  mediator?: ContextMediator;
}

/**
 * Orchestrates interactions between contexts in the system
 */
export class ContextOrchestrator {
  private static instance: ContextOrchestrator | null = null;
  
  /** Context manager for accessing contexts */
  private contextManager: ContextManager;
  
  /** Context mediator for messaging */
  private mediator: ContextMediator;
  
  /** Logger instance */
  private logger = Logger.getInstance();
  
  /**
   * Get the singleton instance of ContextOrchestrator
   * 
   * @param options Configuration options
   * @returns The singleton instance
   */
  public static getInstance(options: ContextOrchestratorOptions): ContextOrchestrator {
    if (!ContextOrchestrator.instance) {
      ContextOrchestrator.instance = new ContextOrchestrator(options);
      
      const logger = Logger.getInstance();
      logger.debug('ContextOrchestrator singleton instance created');
    }
    
    return ContextOrchestrator.instance;
  }
  
  /**
   * Reset the singleton instance
   * This is primarily used for testing to ensure a clean state between tests
   */
  public static resetInstance(): void {
    if (ContextManager.resetInstance) {
      ContextManager.resetInstance();
    }
    
    ContextOrchestrator.instance = null;
    
    const logger = Logger.getInstance();
    logger.debug('ContextOrchestrator singleton instance reset');
  }
  
  /**
   * Create a fresh instance without affecting the singleton
   * 
   * @param options Configuration options
   * @returns A new instance
   */
  public static createFresh(options: ContextOrchestratorOptions): ContextOrchestrator {
    const logger = Logger.getInstance();
    logger.debug('Creating fresh ContextOrchestrator instance');
    
    return new ContextOrchestrator(options);
  }
  
  /**
   * Private constructor to enforce getInstance() usage
   * 
   * @param options Configuration options
   */
  private constructor(options: ContextOrchestratorOptions) {
    // Initialize the context manager
    this.contextManager = ContextManager.getInstance({ config: options.config });
    
    // Ensure contexts are ready
    if (!this.contextManager.areContextsReady()) {
      throw new Error('Context manager initialization failed: contexts not ready');
    }
    
    // Initialize context links
    this.contextManager.initializeContextLinks();
    
    // Initialize or use provided mediator
    this.mediator = options.mediator || ContextMediator.getInstance();
    
    // Set up message handlers for each context
    this.registerContextHandlers();
    
    // Set up subscriptions for notifications
    this.registerSubscriptions();
    
    this.logger.info('Context orchestrator initialized');
  }
  
  /**
   * Get the note context
   * @returns Note context
   */
  getNoteContext(): MCPNoteContext {
    return this.contextManager.getNoteContext();
  }
  
  /**
   * Get the ProfileContext instance
   * @returns ProfileContext instance
   */
  getProfileContext(): MCPProfileContext {
    return this.contextManager.getProfileContext();
  }
  
  /**
   * Get the conversation context
   * @returns Conversation context
   */
  getConversationContext(): MCPConversationContext {
    return this.contextManager.getConversationContext();
  }
  
  /**
   * Get the external source context
   * @returns External source context
   */
  getExternalSourceContext(): MCPExternalSourceContext {
    return this.contextManager.getExternalSourceContext();
  }
  
  /**
   * Get the website context
   * @returns Website context
   */
  getWebsiteContext(): MCPWebsiteContext {
    return this.contextManager.getWebsiteContext();
  }
  
  /**
   * Enable or disable external sources
   * @param enabled Whether external sources are enabled
   */
  setExternalSourcesEnabled(enabled: boolean): void {
    this.contextManager.setExternalSourcesEnabled(enabled);
    this.logger.debug(`External sources ${enabled ? 'enabled' : 'disabled'}`);
    
    // Send notification about status change
    // We'll send the notification but don't await it to avoid potential issues
    this.notifyExternalSourcesStatusChange(enabled).catch(error => {
      this.logger.error('Error in notification after setExternalSourcesEnabled:', error);
    });
  }
  
  /**
   * Check if external sources are enabled
   * @returns Whether external sources are enabled
   */
  getExternalSourcesEnabled(): boolean {
    return this.contextManager.getExternalSourcesEnabled();
  }
  
  /**
   * Check if all contexts are ready
   * @returns Whether all contexts are ready
   */
  areContextsReady(): boolean {
    return this.contextManager.areContextsReady();
  }
  
  /**
   * Get the context manager
   * @returns Context manager
   */
  getContextManager(): ContextManager {
    return this.contextManager;
  }
  
  /**
   * Get the context mediator
   * @returns Context mediator
   */
  getMediator(): ContextMediator {
    return this.mediator;
  }
  
  /**
   * Register message handlers for each context
   */
  private registerContextHandlers(): void {
    // Register handler for each context
    this.mediator.registerHandler(ContextId.NOTES, this.createNoteContextHandler());
    this.mediator.registerHandler(ContextId.PROFILE, this.createProfileContextHandler());
    this.mediator.registerHandler(ContextId.CONVERSATION, this.createConversationContextHandler());
    this.mediator.registerHandler(ContextId.EXTERNAL_SOURCES, this.createExternalSourcesContextHandler());
    this.mediator.registerHandler(ContextId.WEBSITE, this.createWebsiteContextHandler());
    
    this.logger.debug('Registered message handlers for all contexts');
  }
  
  /**
   * Register subscriptions for notifications
   */
  private registerSubscriptions(): void {
    // Notes context subscriptions
    this.mediator.subscribe(ContextId.NOTES, NotificationType.PROFILE_UPDATED);
    this.mediator.subscribe(ContextId.NOTES, NotificationType.CONVERSATION_STARTED);
    
    // Profile context subscriptions
    this.mediator.subscribe(ContextId.PROFILE, NotificationType.NOTE_CREATED);
    this.mediator.subscribe(ContextId.PROFILE, NotificationType.NOTE_UPDATED);
    
    // Conversation context subscriptions
    this.mediator.subscribe(ContextId.CONVERSATION, NotificationType.NOTE_CREATED);
    this.mediator.subscribe(ContextId.CONVERSATION, NotificationType.PROFILE_UPDATED);
    this.mediator.subscribe(ContextId.CONVERSATION, NotificationType.EXTERNAL_SOURCES_STATUS);
    
    // External sources context subscriptions
    this.mediator.subscribe(ContextId.EXTERNAL_SOURCES, NotificationType.CONVERSATION_STARTED);
    
    // Website context subscriptions
    this.mediator.subscribe(ContextId.WEBSITE, NotificationType.PROFILE_UPDATED);
    
    this.logger.debug('Registered subscriptions for all contexts');
  }
  
  /**
   * Create message handler for the Notes context
   * 
   * @returns Message handler function
   */
  private createNoteContextHandler(): MessageHandler {
    const noteContext = this.getNoteContext();
    
    return async (message) => {
      if (message.category === 'request' && 'dataType' in message) {
        const request = message;
        
        // Handle different data request types
        switch (request.dataType) {
        case DataRequestType.NOTES_SEARCH: {
          try {
            const searchParams = request.parameters || {};
            // Create search options object instead of using positional parameters
            const searchOptions = {
              query: searchParams['query'] as string,
              limit: searchParams['limit'] as number,
              semanticSearch: true,
            };
            
            const notes = await noteContext.searchNotes(searchOptions);
              
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
              'Failed to search notes',
              error instanceof Error ? error.message : String(error),
            );
          }
        }
        
        case DataRequestType.NOTE_BY_ID: {
          try {
            const noteId = request.parameters?.['id'] as string;
            if (!noteId) {
              return MessageFactory.createErrorResponse(
                ContextId.NOTES,
                request.sourceContext,
                request.id,
                'Note ID is required',
              );
            }
            
            const note = await noteContext.getNoteById(noteId);
            
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
              'Failed to get note by ID',
              error instanceof Error ? error.message : String(error),
            );
          }
        }
        
        case DataRequestType.NOTES_SEMANTIC_SEARCH: {
          try {
            const limit = request.parameters?.['limit'] as number || 10;
            const notes = await noteContext.getRecentNotes(limit);
            
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
              'Failed to get recent notes',
              error instanceof Error ? error.message : String(error),
            );
          }
        }
        
        default:
          return MessageFactory.createErrorResponse(
            ContextId.NOTES,
            request.sourceContext,
            request.id,
            `Unsupported data type: ${request.dataType}`,
          );
        }
      }
      
      if (message.category === 'notification') {
        const notification = message;
        
        // Log notifications received by the notes context
        this.logger.debug(`Notes context received notification: ${notification.type}`);
        
        // No response needed for notifications
      }
      
      // Return void instead of null to match MessageHandler return type
      return;
    };
  }
  
  /**
   * Create message handler for the Profile context
   * 
   * @returns Message handler function
   */
  private createProfileContextHandler(): MessageHandler {
    const profileContext = this.contextManager.getProfileContext();
    
    return async (message) => {
      if (message.category === 'request' && 'dataType' in message) {
        const request = message;
        
        switch (request.dataType) {
        case DataRequestType.PROFILE_DATA: {
          try {
            const profile = await profileContext.getProfile();
            
            return MessageFactory.createSuccessResponse(
              ContextId.PROFILE,
              request.sourceContext,
              request.id,
              { profile },
            );
          } catch (error) {
            return MessageFactory.createErrorResponse(
              ContextId.PROFILE,
              request.sourceContext,
              request.id,
              'Failed to get profile',
              error instanceof Error ? error.message : String(error),
            );
          }
        }
        
        default:
          return MessageFactory.createErrorResponse(
            ContextId.PROFILE,
            request.sourceContext,
            request.id,
            `Unsupported data type: ${request.dataType}`,
          );
        }
      }
      
      if (message.category === 'notification') {
        const notification = message;
        
        // Log notifications received by the profile context
        this.logger.debug(`Profile context received notification: ${notification.type}`);
      }
      
      // Return void instead of null to match MessageHandler return type
      return;
    };
  }
  
  /**
   * Create message handler for the Conversation context
   * 
   * @returns Message handler function
   */
  private createConversationContextHandler(): MessageHandler {
    const conversationContext = this.getConversationContext();
    
    return async (message) => {
      if (message.category === 'request' && 'dataType' in message) {
        const request = message;
        
        switch (request.dataType) {
        case DataRequestType.CONVERSATION_HISTORY: {
          try {
            const conversationId = request.parameters?.['id'] as string;
            const conversation = await conversationContext.getConversation(conversationId);
            
            return MessageFactory.createSuccessResponse(
              ContextId.CONVERSATION,
              request.sourceContext,
              request.id,
              { conversation },
            );
          } catch (error) {
            return MessageFactory.createErrorResponse(
              ContextId.CONVERSATION,
              request.sourceContext,
              request.id,
              'Failed to get conversation history',
              error instanceof Error ? error.message : String(error),
            );
          }
        }
        
        default:
          return MessageFactory.createErrorResponse(
            ContextId.CONVERSATION,
            request.sourceContext,
            request.id,
            `Unsupported data type: ${request.dataType}`,
          );
        }
      }
      
      if (message.category === 'notification') {
        const notification = message;
        
        // Log notifications received by the conversation context
        this.logger.debug(`Conversation context received notification: ${notification.type}`);
      }
      
      // Return void instead of null to match MessageHandler return type
      return;
    };
  }
  
  /**
   * Create message handler for the External Sources context
   * 
   * @returns Message handler function
   */
  private createExternalSourcesContextHandler(): MessageHandler {
    const externalSourceContext = this.getExternalSourceContext();
    
    return async (message) => {
      if (message.category === 'request' && 'dataType' in message) {
        const request = message;
        
        switch (request.dataType) {
        case DataRequestType.EXTERNAL_SOURCES: {
          try {
            const query = request.parameters?.['query'] as string;
            if (!query) {
              return MessageFactory.createErrorResponse(
                ContextId.EXTERNAL_SOURCES,
                request.sourceContext,
                request.id,
                'Query is required',
              );
            }
            
            // Discard any notes passed as they're not used in the search options currently
            // const notes = request.parameters?.['notes'] as unknown[];
            
            const results = await externalSourceContext.search(query);
            
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
              'Failed to get external sources',
              error instanceof Error ? error.message : String(error),
            );
          }
        }
        
        default:
          return MessageFactory.createErrorResponse(
            ContextId.EXTERNAL_SOURCES,
            request.sourceContext,
            request.id,
            `Unsupported data type: ${request.dataType}`,
          );
        }
      }
      
      if (message.category === 'notification') {
        const notification = message;
        
        // Handle specific notifications
        if (notification.type === NotificationType.CONVERSATION_STARTED) {
          // Nothing to do yet
          this.logger.debug('External sources received conversation started notification');
        }
      }
      
      // Return void instead of null to match MessageHandler return type
      return;
    };
  }
  
  /**
   * Create message handler for the Website context
   * 
   * @returns Message handler function
   */
  private createWebsiteContextHandler(): MessageHandler {
    const websiteContext = this.getWebsiteContext();
    
    return async (message) => {
      if (message.category === 'request' && 'dataType' in message) {
        const request = message;
        
        switch (request.dataType) {
        case DataRequestType.WEBSITE_STATUS: {
          try {
            const identity = await websiteContext.getIdentity();
            
            return MessageFactory.createSuccessResponse(
              ContextId.WEBSITE,
              request.sourceContext,
              request.id,
              { identity },
            );
          } catch (error) {
            return MessageFactory.createErrorResponse(
              ContextId.WEBSITE,
              request.sourceContext,
              request.id,
              'Failed to get website identity',
              error instanceof Error ? error.message : String(error),
            );
          }
        }
        
        default:
          return MessageFactory.createErrorResponse(
            ContextId.WEBSITE,
            request.sourceContext,
            request.id,
            `Unsupported data type: ${request.dataType}`,
          );
        }
      }
      
      if (message.category === 'notification') {
        const notification = message;
        
        // Handle specific notifications for website context
        if (notification.type === NotificationType.PROFILE_UPDATED) {
          // Regenerate website identity when profile is updated
          this.logger.debug('Website context received profile updated notification');
          
          // Start asynchronous identity generation
          websiteContext.generateIdentity().catch((error: Error) => {
            this.logger.error('Error generating website identity after profile update', error.message);
          });
        }
      }
      
      // Return void instead of null to match MessageHandler return type
      return;
    };
  }
  
  /**
   * Send notification about external sources status change
   * @param enabled Whether external sources are enabled
   */
  private async notifyExternalSourcesStatusChange(enabled: boolean): Promise<void> {
    const notification = MessageFactory.createNotification(
      ContextId.PROFILE, // Source context (not really important for this notification)
      ContextId.ALL, // Target all contexts
      NotificationType.EXTERNAL_SOURCES_STATUS,
      { enabled },
    );
    
    try {
      // Send to subscribers (currently only conversation context)
      await this.mediator.sendNotification(notification);
      this.logger.debug('Sent external sources status notification');
    } catch (error) {
      this.logger.error('Error sending external sources status notification:', error);
    }
  }
}