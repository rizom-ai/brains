/**
 * Conversation Note Adapter
 * 
 * This adapter provides methods for working with conversation-related notes
 * without extending the NoteRepository directly. It follows the standardized
 * Component Interface pattern.
 */

import { desc, like } from 'drizzle-orm';

import { db as defaultDb } from '@/db';
import { notes } from '@/db/schema';
import type { Note } from '@/models/note';
import { selectNoteSchema } from '@/models/note';
import type { NoteRepository } from '@/services/notes/noteRepository';
import { NoteRepository as DefaultNoteRepository } from '@/services/notes/noteRepository';
import { DatabaseError } from '@/utils/errorUtils';
import { Logger } from '@/utils/logger';

/**
 * Dependencies for the ConversationNoteAdapter
 */
export interface ConversationNoteAdapterDependencies {
  db?: typeof defaultDb;
  repository?: NoteRepository;
  logger?: Logger;
}

/**
 * Adapter for conversation note operations
 * 
 * This adapter provides conversation-specific note operations while following
 * the Component Interface Standardization pattern with getInstance/resetInstance/createFresh
 */
export class ConversationNoteAdapter {
  private static instance: ConversationNoteAdapter | null = null;
  
  private db: typeof defaultDb;
  private repository: NoteRepository;
  private logger: Logger;
  
  /**
   * Private constructor for dependency injection
   */
  private constructor(dependencies?: ConversationNoteAdapterDependencies) {
    this.db = dependencies?.db || defaultDb;
    this.repository = dependencies?.repository || DefaultNoteRepository.getInstance();
    this.logger = dependencies?.logger || Logger.getInstance();
  }
  
  /**
   * Get singleton instance
   */
  public static getInstance(dependencies?: ConversationNoteAdapterDependencies): ConversationNoteAdapter {
    if (!ConversationNoteAdapter.instance) {
      ConversationNoteAdapter.instance = new ConversationNoteAdapter(dependencies);
    }
    return ConversationNoteAdapter.instance;
  }
  
  /**
   * Reset singleton instance (primarily for testing)
   */
  public static resetInstance(): void {
    ConversationNoteAdapter.instance = null;
  }
  
  /**
   * Create fresh instance (primarily for testing)
   */
  public static createFresh(dependencies?: ConversationNoteAdapterDependencies): ConversationNoteAdapter {
    return new ConversationNoteAdapter(dependencies);
  }
  
  /**
   * Find all notes with source = 'conversation'
   * @param limit Maximum number of notes to return
   * @param offset Pagination offset
   * @returns Array of conversation notes
   */
  async findConversationNotes(limit = 10, offset = 0): Promise<Note[]> {
    this.logger.debug('Finding conversation notes', { limit, offset });
    return this.repository.findBySource('conversation', limit, offset);
  }
  
  /**
   * Find notes by conversation ID
   * @param conversationId The conversation ID to search for
   * @returns Array of notes with matching conversation ID
   */
  async findByConversationId(conversationId: string): Promise<Note[]> {
    this.logger.debug('Finding notes by conversation ID', { conversationId });
    
    try {
      // Use the repository's search method with conversationId parameter
      return await this.repository.search({
        conversationId,
        source: 'conversation',
      });
    } catch (error) {
      this.logger.error('Error finding notes by conversation ID', { conversationId, error });
      throw new DatabaseError('Failed to find notes by conversation ID', { error });
    }
  }
  
  /**
   * Find notes by conversation metadata field value
   * @param field The field name in conversationMetadata
   * @param value The value to match
   * @returns Array of notes with matching metadata
   */
  async findByMetadataField(field: string, value: string): Promise<Note[]> {
    this.logger.debug('Finding notes by metadata field', { field, value });
    
    try {
      // Direct database query since this is a specialized operation
      const results = await this.db
        .select()
        .from(notes)
        .where(like(notes.conversationMetadata, `%"${field}":"${value}"%`))
        .orderBy(desc(notes.createdAt));
      
      return results.map(note => selectNoteSchema.parse(note));
    } catch (error) {
      this.logger.error('Error finding notes by metadata field', { field, value, error });
      throw new DatabaseError('Failed to find notes by metadata field', { error });
    }
  }
  
  /**
   * Get all conversation notes with a particular tag
   * @param tag The tag to search for
   * @returns Array of notes with the specified tag and source=conversation
   */
  async findConversationNotesByTag(tag: string): Promise<Note[]> {
    this.logger.debug('Finding conversation notes by tag', { tag });
    
    try {
      return await this.repository.search({
        tags: [tag],
        source: 'conversation',
      });
    } catch (error) {
      this.logger.error('Error finding conversation notes by tag', { tag, error });
      throw new DatabaseError('Failed to find conversation notes by tag', { error });
    }
  }
}