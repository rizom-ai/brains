/**
 * Messaging-Enabled Note Context
 * 
 * This module extends the NoteContext with messaging capabilities,
 * allowing it to participate in cross-context communication.
 */

import type { Note } from '@/models/note';
import { ContextId } from '@/protocol/core/contextOrchestrator';
import { type ContextMediator, MessageFactory } from '@/protocol/messaging';
import { Logger } from '@/utils/logger';

import type { MCPNoteContext } from '../MCPNoteContext';

import { NoteMessageHandler } from './noteMessageHandler';
import { NoteNotifier } from './noteNotifier';

/**
 * Messaging-enabled extension of NoteContext
 */
export class NoteContextMessaging {
  private logger = Logger.getInstance();
  private notifier: NoteNotifier;
  
  /**
   * Create a messaging-enabled wrapper for a MCPNoteContext
   * 
   * @param noteContext The MCP note context to extend
   * @param mediator The context mediator for messaging
   */
  constructor(
    private noteContext: MCPNoteContext,
    mediator: ContextMediator,
  ) {
    // Create notifier
    this.notifier = new NoteNotifier(mediator);
    
    // Register message handler using the Component Interface Standardization pattern
    // Create the handler using the singleton approach for consistency
    const handler = NoteMessageHandler.getInstance(noteContext);
    mediator.registerHandler(ContextId.NOTES, async (message) => {
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
      
      // Default return value for unrecognized message format
      return MessageFactory.createErrorResponse(
        ContextId.NOTES,
        message.sourceContext,
        message.id,
        'INVALID_MESSAGE_FORMAT',
        'Message format not recognized',
      );
    });
    
    this.logger.debug('NoteContextMessaging initialized');
  }
  
  /**
   * Get the underlying MCP note context
   * @returns The MCP note context
   */
  getContext(): MCPNoteContext {
    return this.noteContext;
  }
  
  /**
   * Create a note with messaging support
   * 
   * @param note Note data to create
   * @returns ID of the created note
   */
  async createNote(note: Partial<Note>): Promise<string> {
    // Delegate to the original context
    const noteId = await this.noteContext.createNote(note);
    
    // Retrieve the full note data
    const fullNote = await this.noteContext.getNoteById(noteId);
    
    // Notify other contexts if the note was created successfully
    if (fullNote) {
      await this.notifier.notifyNoteCreated(fullNote);
    }
    
    return noteId;
  }
  
  /**
   * Update a note with messaging support
   * 
   * @param id Note ID to update
   * @param data Updated note data
   * @returns Whether the update was successful
   */
  async updateNote(id: string, data: Partial<Note>): Promise<boolean> {
    // Delegate to the original context 
    const success = await this.noteContext.updateNote(id, data);
    
    // Notify other contexts if the update was successful
    if (success) {
      // Retrieve the updated note data
      const updatedNote = await this.noteContext.getNoteById(id);
      if (updatedNote) {
        await this.notifier.notifyNoteUpdated(updatedNote);
      }
    }
    
    return success;
  }
  
  /**
   * Delete a note with messaging support
   * 
   * @param id Note ID to delete
   * @returns Whether the deletion was successful
   */
  async deleteNote(id: string): Promise<boolean> {
    // Check if note exists first
    const noteToDelete = await this.noteContext.getNoteById(id);
    if (!noteToDelete) return false;
    
    // Delete the note
    const success = await this.noteContext.deleteNote(id);
    
    // Notify other contexts if the deletion was successful
    if (success) {
      await this.notifier.notifyNoteDeleted(id);
    }
    
    return success;
  }
  
  
  /**
   * Delegate all other methods to the original context
   * This ensures that the messaging-enabled context behaves
   * exactly like the original context, just with added messaging.
   */
  getNoteById(id: string): Promise<Note | null> {
    return this.noteContext.getNoteById(id);
  }
  
  searchNotes(options: object): Promise<Note[]> {
    return this.noteContext.searchNotes(options);
  }
  
  /**
   * Get all notes (commented out if method doesn't exist on NoteContext)
   */
  // getAllNotes(limit?: number): Promise<Note[]> {
  //   return this.noteContext.getAllNotes(limit);
  // }
  
  searchWithEmbedding(text: string, limit?: number, tags?: string[]): Promise<Array<Note & { score?: number }>> {
    return this.noteContext.searchWithEmbedding(text, limit, tags);
  }
  
  // Method removed - Embeddings are now required for all notes
  
  /**
   * Search notes by tag (commented out if method doesn't exist on NoteContext)
   */
  // searchNotesByTag(tags: string[], limit?: number): Promise<Note[]> {
  //   return this.noteContext.searchNotesByTag(tags, limit);
  // }
  
  async getRecentNotes(limit?: number): Promise<Note[]> {
    return this.noteContext.getRecentNotes(limit);
  }
}