/**
 * Conversation Context Notifier
 * 
 * This module provides notification capabilities for the ConversationContext,
 * allowing it to send notifications to other contexts when conversations are
 * started, updated, or cleared.
 */

import { ContextId } from '@/protocol/core/contextOrchestrator';
import type { ContextMediator } from '@/protocol/messaging';
import { MessageFactory, NotificationType } from '@/protocol/messaging';
import type { Conversation, ConversationTurn } from '@/protocol/schemas/conversationSchemas';
import { Logger } from '@/utils/logger';


/**
 * Notifier for conversation-related events
 */
export class ConversationNotifier {
  private logger = Logger.getInstance();
  
  /**
   * Create a new conversation notifier
   * 
   * @param mediator Context mediator for sending notifications
   */
  constructor(private mediator: ContextMediator) {}
  
  /**
   * Notify other contexts that a conversation was started
   * 
   * @param conversation The conversation that was started
   */
  async notifyConversationStarted(conversation: Conversation): Promise<void> {
    try {
      const notification = MessageFactory.createNotification(
        ContextId.CONVERSATION,
        '*', // Broadcast to all interested contexts
        NotificationType.CONVERSATION_STARTED,
        {
          id: conversation.id,
          roomId: conversation.roomId,
          interfaceType: conversation.interfaceType,
          createdAt: conversation.createdAt,
        },
      );
      
      const recipients = await this.mediator.sendNotification(notification);
      if (recipients && recipients.length) {
        this.logger.debug(`Conversation started notification sent to ${recipients.length} contexts`);
      } else {
        this.logger.debug('No subscribers received conversation started notification');
      }
    } catch (error) {
      this.logger.error('Error sending conversation started notification:', error);
    }
  }
  
  /**
   * Notify other contexts that a conversation was cleared
   * 
   * @param conversationId The ID of the conversation that was cleared
   */
  async notifyConversationCleared(conversationId: string): Promise<void> {
    try {
      const notification = MessageFactory.createNotification(
        ContextId.CONVERSATION,
        '*', // Broadcast to all interested contexts
        NotificationType.CONVERSATION_CLEARED,
        {
          id: conversationId,
        },
      );
      
      const recipients = await this.mediator.sendNotification(notification);
      if (recipients && recipients.length) {
        this.logger.debug(`Conversation cleared notification sent to ${recipients.length} contexts`);
      } else {
        this.logger.debug('No subscribers received conversation cleared notification');
      }
    } catch (error) {
      this.logger.error('Error sending conversation cleared notification:', error);
    }
  }
  
  /**
   * Notify other contexts that a conversation turn was added
   * 
   * @param conversationId The ID of the conversation
   * @param turn The turn that was added
   */
  async notifyConversationTurnAdded(conversationId: string, turn: ConversationTurn): Promise<void> {
    try {
      // Don't include the full turn in the notification, just metadata
      const notification = MessageFactory.createNotification(
        ContextId.CONVERSATION,
        '*', // Broadcast to all interested contexts
        NotificationType.CONVERSATION_TURN_ADDED,
        {
          conversationId,
          turnId: turn.id,
          timestamp: turn.timestamp,
          userId: turn.userId,
          // Don't include query or response content in the notification for privacy
        },
      );
      
      const recipients = await this.mediator.sendNotification(notification);
      if (recipients && recipients.length) {
        this.logger.debug(`Conversation turn added notification sent to ${recipients.length} contexts`);
      } else {
        this.logger.debug('No subscribers received conversation turn added notification');
      }
    } catch (error) {
      this.logger.error('Error sending conversation turn added notification:', error);
    }
  }
}