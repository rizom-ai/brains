/**
 * Note Context Notifier
 * 
 * This module provides notification capabilities for the NoteContext,
 * allowing it to send notifications to other contexts when notes are
 * created, updated, or deleted.
 */

import type { Note } from '@/models/note';
import { ContextId } from '@/protocol/core/contextOrchestrator';
import type { ContextMediator } from '@/protocol/messaging';
import { MessageFactory, NotificationType } from '@/protocol/messaging';
import { Logger } from '@/utils/logger';


/**
 * Notifier for note-related events
 */
export class NoteNotifier {
  private logger = Logger.getInstance();
  
  /**
   * Create a new note notifier
   * 
   * @param mediator Context mediator for sending notifications
   */
  constructor(private mediator: ContextMediator) {}
  
  /**
   * Notify other contexts that a note was created
   * 
   * @param note The note that was created
   */
  async notifyNoteCreated(note: Note): Promise<void> {
    try {
      const notification = MessageFactory.createNotification(
        ContextId.NOTES,
        '*', // Broadcast to all interested contexts
        NotificationType.NOTE_CREATED,
        {
          id: note.id,
          title: note.title,
          tags: note.tags,
          createdAt: note.createdAt,
        },
      );
      
      const recipients = await this.mediator.sendNotification(notification);
      if (recipients && recipients.length) {
        this.logger.debug(`Note created notification sent to ${recipients.length} contexts`);
      } else {
        this.logger.debug('No subscribers received note created notification');
      }
    } catch (error) {
      this.logger.error('Error sending note created notification:', error);
    }
  }
  
  /**
   * Notify other contexts that a note was updated
   * 
   * @param note The note that was updated
   */
  async notifyNoteUpdated(note: Note): Promise<void> {
    try {
      const notification = MessageFactory.createNotification(
        ContextId.NOTES,
        '*', // Broadcast to all interested contexts
        NotificationType.NOTE_UPDATED,
        {
          id: note.id,
          title: note.title,
          tags: note.tags,
          updatedAt: note.updatedAt,
        },
      );
      
      const recipients = await this.mediator.sendNotification(notification);
      if (recipients && recipients.length) {
        this.logger.debug(`Note updated notification sent to ${recipients.length} contexts`);
      } else {
        this.logger.debug('No subscribers received note updated notification');
      }
    } catch (error) {
      this.logger.error('Error sending note updated notification:', error);
    }
  }
  
  /**
   * Notify other contexts that a note was deleted
   * 
   * @param noteId The ID of the note that was deleted
   */
  async notifyNoteDeleted(noteId: string): Promise<void> {
    try {
      const notification = MessageFactory.createNotification(
        ContextId.NOTES,
        '*', // Broadcast to all interested contexts
        NotificationType.NOTE_DELETED,
        {
          id: noteId,
        },
      );
      
      const recipients = await this.mediator.sendNotification(notification);
      if (recipients && recipients.length) {
        this.logger.debug(`Note deleted notification sent to ${recipients.length} contexts`);
      } else {
        this.logger.debug('No subscribers received note deleted notification');
      }
    } catch (error) {
      this.logger.error('Error sending note deleted notification:', error);
    }
  }
}