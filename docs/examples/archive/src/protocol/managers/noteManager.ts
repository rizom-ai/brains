/**
 * Note Manager for BrainProtocol
 * Manages note operations and search functionality
 * 
 * Implements the Component Interface Standardization pattern with:
 * - getInstance(): Returns the singleton instance
 * - resetInstance(): Resets the singleton instance (mainly for testing)
 * - createFresh(): Creates a new instance without affecting the singleton
 */
import type { MCPNoteContext } from '@/contexts';
import type { Note } from '@/models/note';
import { Logger } from '@/utils/logger';

import type { INoteManager } from '../types';

/**
 * Configuration options for NoteManager
 */
export interface NoteManagerConfig {
  /** Note context instance */
  noteContext: MCPNoteContext;
}

/**
 * Manages note operations and search functionality
 */
export class NoteManager implements INoteManager {
  /**
   * Singleton instance of NoteManager
   * This property should be accessed only by getInstance(), resetInstance(), and createFresh()
   */
  private static instance: NoteManager | null = null;
  
  /**
   * Logger instance for this class
   */
  private logger = Logger.getInstance();
  
  private noteContext: MCPNoteContext;

  /**
   * Get the singleton instance of NoteManager
   * 
   * Part of the Component Interface Standardization pattern.
   * 
   * @param config Configuration options (only used when creating a new instance)
   * @returns The singleton instance
   */
  public static getInstance(config: NoteManagerConfig): NoteManager {
    if (!NoteManager.instance) {
      NoteManager.instance = new NoteManager(config);
      
      const logger = Logger.getInstance();
      logger.debug('NoteManager singleton instance created');
    } else if (config && Object.keys(config).length > 0) {
      // Log a warning if trying to get instance with different config
      const logger = Logger.getInstance();
      logger.warn('getInstance called with config but instance already exists. Config ignored.');
    }
    
    return NoteManager.instance;
  }

  /**
   * Reset the singleton instance
   * 
   * Part of the Component Interface Standardization pattern.
   * Primarily used for testing to ensure a clean state.
   */
  public static resetInstance(): void {
    try {
      // Clean up resources if needed
      if (NoteManager.instance) {
        // Any cleanup needed would go here
      }
    } catch (error) {
      const logger = Logger.getInstance();
      logger.error('Error during NoteManager instance reset:', error);
    } finally {
      NoteManager.instance = null;
      
      const logger = Logger.getInstance();
      logger.debug('NoteManager singleton instance reset');
    }
  }

  /**
   * Create a fresh NoteManager instance
   * 
   * Part of the Component Interface Standardization pattern.
   * Creates a new instance without affecting the singleton instance.
   * Primarily used for testing.
   * 
   * @param config Configuration options
   * @returns A new NoteManager instance
   */
  public static createFresh(config: NoteManagerConfig): NoteManager {
    const logger = Logger.getInstance();
    logger.debug('Creating fresh NoteManager instance');
    
    return new NoteManager(config);
  }

  /**
   * Create a new note manager
   * 
   * Note: When not testing, prefer using getInstance() or createFresh() factory methods
   * 
   * @param config Configuration options containing note context
   */
  private constructor(config: NoteManagerConfig) {
    this.noteContext = config.noteContext;
    this.logger.debug('Note manager initialized');
  }

  /**
   * Get the note context
   * @returns The note context
   */
  getNoteContext(): MCPNoteContext {
    return this.noteContext;
  }

  /**
   * Fetch relevant notes for a query
   * @param query The user query
   * @returns Array of relevant notes
   */
  async fetchRelevantNotes(query: string): Promise<Note[]> {
    // First, try to extract any explicit tags from the query
    const tagRegex = /#(\w+)/g;
    const tagMatches = [...query.matchAll(tagRegex)];
    const tags = tagMatches.map(match => match[1]);

    // Remove the tags from the query for better text matching
    const cleanQuery = query.replace(tagRegex, '').trim();

    // Check for specific topic mentions like "MCP", "Model-Context-Protocol"
    const topicRegex = /\b(MCP|Model[-\s]Context[-\s]Protocol|AI architecture)\b/i;
    const hasMcpTopic = topicRegex.test(query);

    if (hasMcpTopic && !tags.includes('MCP')) {
      tags.push('MCP');
    }

    this.logger.debug(`Query: "${cleanQuery}", Tags: [${tags.join(', ')}]`);

    // Use semantic search by default for better results
    let results = await this.noteContext.searchNotes({
      query: cleanQuery,
      tags: tags.length > 0 ? tags : undefined,
      limit: 5,
      semanticSearch: true,
    });

    // If no results and we have tags, try with just tags
    if (results.length === 0 && tags.length > 0) {
      this.logger.debug('No results with query and tags, trying tags only');
      results = await this.searchByTags(tags, 5);
    }

    // If still no results, fall back to keyword search
    if (results.length === 0) {
      this.logger.debug('No results with semantic search, trying keyword search');
      results = await this.noteContext.searchNotes({
        query: cleanQuery,
        tags: tags.length > 0 ? tags : undefined,
        limit: 5,
        semanticSearch: false,
      });
    }

    // If no matches, return all notes as a fallback (limited to 3)
    if (results.length === 0) {
      this.logger.debug('No specific matches, fetching recent notes as fallback');
      results = await this.getRecentNotes(3);
    }

    return results;
  }

  /**
   * Get related notes for suggestions
   * @param notes The notes to find related notes for
   * @param limit Maximum number of related notes to return
   * @returns Array of related notes
   */
  async getRelatedNotes(notes: Note[], limit: number = 3): Promise<Note[]> {
    if (notes.length === 0) {
      this.logger.debug('No notes provided, returning recent notes');
      return this.getRecentNotes(limit);
    }

    // Use the first note to find related content
    const primaryNoteId = notes[0].id;
    this.logger.debug(`Finding related notes for primary note: ${primaryNoteId}`);
    return this.noteContext.getRelatedNotes(primaryNoteId, limit);
  }

  /**
   * Search notes by tags
   * @param tags Tags to search for
   * @param limit Maximum number of notes to return
   * @returns Array of matching notes
   */
  async searchByTags(tags: string[], limit: number = 5): Promise<Note[]> {
    return this.noteContext.searchNotes({
      tags,
      limit,
      semanticSearch: false, // Tags only doesn't benefit from semantic search
    });
  }

  /**
   * Get a note by ID
   * @param id Note ID
   * @returns The note or null if not found
   */
  async getNoteById(id: string): Promise<Note | null> {
    const note = await this.noteContext.getNoteById(id);
    return note || null;
  }

  /**
   * Get recent notes
   * @param limit Maximum number of notes to return
   * @returns Array of recent notes
   */
  async getRecentNotes(limit: number = 5): Promise<Note[]> {
    return this.noteContext.getRecentNotes(limit);
  }
}