/**
 * Messaging-Enabled Conversation Context
 * 
 * This module extends the ConversationContext with messaging capabilities,
 * allowing it to participate in cross-context communication.
 */

import { ContextId } from '@/protocol/core/contextOrchestrator';
import type { ContextMediator, DataRequestMessage, NotificationMessage } from '@/protocol/messaging';
import { MessageFactory } from '@/protocol/messaging';
import type { Conversation, ConversationTurn } from '@/protocol/schemas/conversationSchemas';
import { Logger } from '@/utils/logger';

import type { MCPConversationContext } from '../MCPConversationContext';

import { ConversationMessageHandler } from './conversationMessageHandler';
import { ConversationNotifier } from './conversationNotifier';

/**
 * Messaging-enabled extension of ConversationContext
 */
export class ConversationContextMessaging {
  private logger = Logger.getInstance();
  private notifier: ConversationNotifier;
  
  /**
   * Create a messaging-enabled wrapper for a ConversationContext
   * 
   * @param conversationContext The conversation context to extend
   * @param mediator The context mediator for messaging
   */
  constructor(
    private conversationContext: MCPConversationContext,
    mediator: ContextMediator,
  ) {
    // Create notifier
    this.notifier = new ConversationNotifier(mediator);
    
    // Register message handler using the Component Interface Standardization pattern
    const handler = ConversationMessageHandler.getInstance(conversationContext);
    mediator.registerHandler(ContextId.CONVERSATION, async (message) => {
      if (message.category === 'request' && 'dataType' in message) {
        return handler.handleRequest(message as DataRequestMessage);
      } else if (message.category === 'notification' && 'notificationType' in message) {
        await handler.handleNotification(message as NotificationMessage);
        return MessageFactory.createAcknowledgment(
          ContextId.CONVERSATION,
          message.sourceContext || '*',
          message.id || 'unknown',
          'processed',
        );
      }
      
      return MessageFactory.createErrorResponse(
        ContextId.CONVERSATION,
        message.sourceContext || '*',
        message.id || 'unknown',
        'INVALID_MESSAGE_FORMAT',
        'Message format not recognized',
      );
    });
    
    this.logger.debug('ConversationContextMessaging initialized');
  }
  
  /**
   * Get the underlying conversation context
   * @returns The conversation context
   */
  getContext(): MCPConversationContext {
    return this.conversationContext;
  }
  
  /**
   * Create a conversation with messaging support
   * 
   * @param interfaceType Interface type (cli or matrix)
   * @param roomId Room ID for the conversation
   * @returns The conversation ID
   */
  async createConversation(
    _interfaceType: 'cli' | 'matrix', 
    _roomId: string,
  ): Promise<string> {
    // MCPConversationContext.createConversation only accepts a title
    // and internally creates the conversation with defaults
    const conversationId = await this.conversationContext.createConversation();
    
    // Notify other contexts if the conversation was initialized successfully
    if (conversationId) {
      // Get the full conversation data
      const conversation = await this.conversationContext.getConversation(conversationId);
      if (conversation) {
        await this.notifier.notifyConversationStarted(conversation);
      }
    }
    
    return conversationId;
  }
  
  /**
   * Delete a conversation with messaging support
   *
   * @param conversationId ID of the conversation to delete
   * @returns Whether the operation was successful
   */
  async deleteConversation(conversationId: string): Promise<boolean> {
    // Delegate to the original context
    const success = await this.conversationContext.deleteConversation(conversationId);
    
    // Notify other contexts if the conversation was deleted successfully
    if (success) {
      await this.notifier.notifyConversationCleared(conversationId);
    }
    
    return success;
  }
  
  /**
   * Add a turn to the conversation with messaging support
   * 
   * @param conversationId The conversation ID
   * @param query The user query
   * @param response Optional assistant response
   * @param options Optional turn options
   * @returns ID of the created turn
   */
  async addTurn(
    conversationId: string,
    query: string,
    response?: string,
    options?: { userId?: string; userName?: string },
  ): Promise<string> {
    // Adapt to MCPConversationContext's addMessage method
    const message = {
      query,
      response: response || '',
      userId: options?.userId,
      userName: options?.userName,
    };
    
    const turn = await this.conversationContext.addMessage(conversationId, message);
    
    // Notify other contexts if the turn was added successfully
    if (turn && turn.id) {
      await this.notifier.notifyConversationTurnAdded(conversationId, turn);
    }
    
    return turn.id || '';
  }
  
  /**
   * Delegate remaining methods to the original context
   */
  
  getConversation(conversationId: string): Promise<Conversation | null> {
    return this.conversationContext.getConversation(conversationId);
  }
  
  getTurns(conversationId: string): Promise<ConversationTurn[]> {
    // MCPConversationContext doesn't have getTurns, use getFlatHistory instead
    return this.conversationContext.getFlatHistory(conversationId);
  }
  
  getConversationIdByRoom(roomId: string, interfaceType?: 'cli' | 'matrix'): Promise<string | null> {
    return this.conversationContext.getConversationIdByRoom(roomId, interfaceType);
  }
  
  getConversationHistory(conversationId: string): Promise<string> {
    // Use formatHistoryForPrompt method
    return this.conversationContext.formatHistoryForPrompt(conversationId);
  }
  
  formatHistoryForPrompt(conversationId: string, maxTokens?: number): Promise<string> {
    return this.conversationContext.formatHistoryForPrompt(conversationId, maxTokens);
  }
  
  updateMetadata(conversationId: string, metadata: Record<string, unknown>): Promise<boolean> {
    // Use updateConversation with metadata
    return this.conversationContext.updateConversation(conversationId, { metadata });
  }
}