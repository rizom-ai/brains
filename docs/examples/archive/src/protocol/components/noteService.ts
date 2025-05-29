/**
 * Service for handling note-related operations
 */

import type { MCPNoteContext } from '@/contexts';
import type { Note } from '@models/note';
import { Logger } from '@utils/logger';

/**
 * Configuration options for NoteService
 */
export interface NoteServiceConfig {
  /** Note context for data access */
  context: MCPNoteContext;
}

/**
 * Handles operations related to notes
 * 
 * Implements the Component Interface Standardization pattern with:
 * - getInstance(): Returns the singleton instance
 * - resetInstance(): Resets the singleton instance (mainly for testing)
 * - createFresh(): Creates a new instance without affecting the singleton
 */
export class NoteService {
  /** The singleton instance */
  private static instance: NoteService | null = null;

  /** Logger instance for this class */
  private logger = Logger.getInstance();
  
  private context: MCPNoteContext;

  /**
   * Get the singleton instance of NoteService
   * 
   * @param config Configuration options
   * @returns The singleton instance
   */
  public static getInstance(config: NoteServiceConfig): NoteService {
    if (!NoteService.instance) {
      NoteService.instance = new NoteService(config.context);
      
      const logger = Logger.getInstance();
      logger.debug('NoteService singleton instance created');
    }
    
    return NoteService.instance;
  }

  /**
   * Reset the singleton instance
   * This is primarily used for testing to ensure a clean state
   */
  public static resetInstance(): void {
    NoteService.instance = null;
    
    const logger = Logger.getInstance();
    logger.debug('NoteService singleton instance reset');
  }

  /**
   * Create a fresh instance without affecting the singleton
   * 
   * @param config Configuration options
   * @returns A new NoteService instance
   */
  public static createFresh(config: NoteServiceConfig): NoteService {
    const logger = Logger.getInstance();
    logger.debug('Creating fresh NoteService instance');
    
    return new NoteService(config.context);
  }

  /**
   * Private constructor to enforce factory method usage
   * 
   * @param context Note context for data access
   */
  private constructor(context: MCPNoteContext) {
    this.context = context;
    this.logger.debug('NoteService initialized');
  }

  /**
   * Get related notes for suggestions
   * @param relevantNotes The notes to find related notes for
   * @param limit Maximum number of related notes to return
   * @returns Array of related notes
   */
  async getRelatedNotes(relevantNotes: Note[], limit: number = 3): Promise<Note[]> {
    if (relevantNotes.length === 0) {
      this.logger.debug('No relevant notes, returning recent notes');
      return this.context.getRecentNotes(limit);
    }

    // Use the most relevant note to find related content
    const primaryNoteId = relevantNotes[0].id;
    this.logger.debug(`Finding related notes for primary note: ${primaryNoteId}`);
    return this.context.getRelatedNotes(primaryNoteId, limit);
  }

  /**
   * Fetch relevant context based on user query
   * @param query The user query
   * @returns Array of relevant notes
   */
  async fetchRelevantContext(query: string): Promise<Note[]> {
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
    let results = await this.context.searchNotes({
      query: cleanQuery,
      tags: tags.length > 0 ? tags : undefined,
      limit: 5,
      semanticSearch: true,
    });

    // If no results and we have tags, try with just tags
    if (results.length === 0 && tags.length > 0) {
      this.logger.debug('No results with query and tags, trying tags only');
      results = await this.context.searchNotes({
        tags,
        limit: 5,
        semanticSearch: false, // Tags only doesn't benefit from semantic search
      });
    }

    // If still no results, fall back to keyword search
    if (results.length === 0) {
      this.logger.debug('No results with semantic search, trying keyword search');
      results = await this.context.searchNotes({
        query: cleanQuery,
        tags: tags.length > 0 ? tags : undefined,
        limit: 5,
        semanticSearch: false,
      });
    }

    // If no matches, return all notes as a fallback (limited to 3)
    if (results.length === 0) {
      this.logger.debug('No specific matches, fetching recent notes as fallback');
      results = await this.context.getRecentNotes(3);
    }

    return results;
  }
}