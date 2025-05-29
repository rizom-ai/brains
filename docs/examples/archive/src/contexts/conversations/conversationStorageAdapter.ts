/**
 * ConversationStorageAdapter
 * 
 * Adapts the ConversationStorage interface to the standard StorageInterface
 * used by the BaseContext architecture.
 * 
 * Implements the Component Interface Standardization pattern with:
 * - getInstance(): Returns the singleton instance
 * - resetInstance(): Resets the singleton instance (mainly for testing)
 * - createFresh(): Creates a new instance without affecting the singleton
 */

import { nanoid } from 'nanoid';

import type {
  ConversationInfo,
  ConversationStorage,
  ConversationSummary,
  NewConversation,
} from '@/contexts/conversations/storage/conversationStorage';
import type { ListOptions, SearchCriteria, StorageInterface } from '@/contexts/storageInterface';
import type { Conversation, ConversationTurn } from '@/protocol/schemas/conversationSchemas';
import { Logger } from '@/utils/logger';


/**
 * Adapter to provide standard StorageInterface for conversations
 */
export class ConversationStorageAdapter implements StorageInterface<Conversation> {
  /** The singleton instance */
  private static instance: ConversationStorageAdapter | null = null;
  
  /** Logger instance for this class */
  private logger = Logger.getInstance();
  
  /**
   * Create a new ConversationStorageAdapter
   * @param storage The underlying storage implementation 
   */
  constructor(private storage: ConversationStorage) {}
  
  /**
   * Get the singleton instance of ConversationStorageAdapter
   * 
   * @param storage The storage implementation to use (only used when creating a new instance)
   * @returns The shared ConversationStorageAdapter instance
   */
  public static getInstance(storage: ConversationStorage): ConversationStorageAdapter {
    if (!ConversationStorageAdapter.instance) {
      ConversationStorageAdapter.instance = ConversationStorageAdapter.createWithDependencies(storage);
    } else if (storage) {
      // Log at debug level if trying to get instance with different storage
      const logger = Logger.getInstance();
      logger.debug('getInstance called with storage but instance already exists. Storage ignored');
    }
    return ConversationStorageAdapter.instance;
  }
  
  /**
   * Reset the singleton instance (primarily for testing)
   * This clears the instance and any resources it holds
   */
  public static resetInstance(): void {
    ConversationStorageAdapter.instance = null;
  }
  
  /**
   * Create a fresh instance (primarily for testing)
   * This creates a new instance without affecting the singleton
   * 
   * @param storage The storage implementation to use
   * @returns A new ConversationStorageAdapter instance
   */
  public static createFresh(storage: ConversationStorage): ConversationStorageAdapter {
    return new ConversationStorageAdapter(storage);
  }
  
  /**
   * Factory method for creating an instance with explicit dependencies
   * 
   * @param storage The storage implementation to use
   * @returns A new ConversationStorageAdapter instance with resolved dependencies
   */
  public static createWithDependencies(storage: ConversationStorage): ConversationStorageAdapter {
    return new ConversationStorageAdapter(storage);
  }

  /**
   * Create a new conversation
   * @param item Partial conversation data
   * @returns The ID of the created conversation
   */
  async create(item: Partial<Conversation>): Promise<string> {
    // Extract the necessary fields from the item
    const newConversation: NewConversation = {
      id: item.id,
      interfaceType: item.interfaceType as 'cli' | 'matrix',
      roomId: item.roomId || '',
      startedAt: item.createdAt || new Date(),
      updatedAt: item.updatedAt || new Date(),
      metadata: item.metadata,
    };

    return this.storage.createConversation(newConversation);
  }

  /**
   * Read a conversation by ID
   * @param id The conversation ID
   * @returns The conversation or null if not found
   */
  async read(id: string): Promise<Conversation | null> {
    return this.storage.getConversation(id);
  }

  /**
   * Update a conversation
   * @param id The conversation ID
   * @param updates Partial conversation data with updates
   * @returns True if updated, false if not found
   */
  async update(id: string, updates: Partial<Conversation>): Promise<boolean> {
    return this.storage.updateConversation(id, updates);
  }

  /**
   * Delete a conversation
   * @param id The conversation ID
   * @returns True if deleted, false if not found
   */
  async delete(id: string): Promise<boolean> {
    return this.storage.deleteConversation(id);
  }

  /**
   * Search for conversations matching criteria
   * @param criteria Search criteria
   * @returns Array of matching conversations
   */
  async search(criteria: SearchCriteria): Promise<Conversation[]> {
    // Adapter pattern to map generic search criteria to ConversationStorage search
    try {
      const conversationCriteria: Record<string, unknown> = {};
      
      // Map standard fields
      if ('interfaceType' in criteria) conversationCriteria['interfaceType'] = criteria['interfaceType'];
      if ('roomId' in criteria) conversationCriteria['roomId'] = criteria['roomId'];
      if ('query' in criteria) conversationCriteria['query'] = criteria['query'];
      if ('startDate' in criteria) conversationCriteria['startDate'] = criteria['startDate'];
      if ('endDate' in criteria) conversationCriteria['endDate'] = criteria['endDate'];
      if ('limit' in criteria) conversationCriteria['limit'] = criteria['limit'];
      if ('offset' in criteria) conversationCriteria['offset'] = criteria['offset'];
      
      // Get conversation info objects from storage
      const conversations = await this.storage.findConversations(conversationCriteria);
      
      // For each info object, fetch the full conversation
      const results: Conversation[] = [];
      
      for (const info of conversations) {
        const conversation = await this.storage.getConversation(info.id);
        if (conversation) {
          results.push(conversation);
        }
      }
      
      return results;
    } catch (error) {
      this.logger.error('Error searching conversations', { error, context: 'ConversationStorageAdapter' });
      return [];
    }
  }

  /**
   * List conversations with pagination
   * @param options Pagination options
   * @returns Array of conversations
   */
  async list(options?: ListOptions): Promise<Conversation[]> {
    try {
      // Use recent conversations as the default list implementation
      const limit = options?.['limit'];
      const offset = options?.['offset'];
      const interfaceType = options?.['interfaceType'] as 'cli' | 'matrix' | undefined;
      
      // Get conversation info objects
      const conversations = await this.storage.getRecentConversations(limit, interfaceType);
      
      // For each info object, fetch the full conversation
      const results: Conversation[] = [];
      
      for (const info of conversations) {
        const conversation = await this.storage.getConversation(info.id);
        if (conversation) {
          results.push(conversation);
        }
      }
      
      // Apply offset if needed
      if (offset && offset > 0) {
        return results.slice(offset);
      }
      
      return results;
    } catch (error) {
      this.logger.error('Error listing conversations', { error, context: 'ConversationStorageAdapter' });
      return [];
    }
  }

  /**
   * Count conversations
   * @param criteria Optional search criteria
   * @returns The count of matching conversations
   */
  async count(criteria?: SearchCriteria): Promise<number> {
    try {
      if (!criteria) {
        // Use findConversations with no criteria to get all conversations
        const conversations = await this.storage.findConversations({});
        return conversations.length;
      }
      
      // Use search with criteria and count the results
      const conversations = await this.search(criteria);
      return conversations.length;
    } catch (error) {
      this.logger.error('Error counting conversations', { error, context: 'ConversationStorageAdapter' });
      return 0;
    }
  }

  // Extended methods for conversation-specific operations

  /**
   * Get conversation ID by room ID
   * @param roomId The room ID
   * @param interfaceType Optional interface type
   * @returns The conversation ID or null if not found
   */
  async getConversationByRoom(
    roomId: string,
    interfaceType?: 'cli' | 'matrix',
  ): Promise<string | null> {
    return this.storage.getConversationByRoom(roomId, interfaceType);
  }

  /**
   * Get or create a conversation for a room
   * @param roomId The room ID
   * @param interfaceType The interface type
   * @returns The conversation ID
   */
  async getOrCreateConversation(
    roomId: string,
    interfaceType: 'cli' | 'matrix',
  ): Promise<string> {
    // Try to find existing conversation
    const existingId = await this.storage.getConversationByRoom(roomId, interfaceType);
    
    if (existingId) {
      return existingId;
    }
    
    // Create a new conversation
    return this.storage.createConversation({
      id: `conv-${nanoid()}`,
      interfaceType,
      roomId,
      startedAt: new Date(),
      updatedAt: new Date(),
    });
  }

  /**
   * Add a turn to a conversation
   * @param conversationId The conversation ID
   * @param turn Partial turn data
   * @returns The ID of the created turn
   */
  async addTurn(
    conversationId: string,
    turn: Partial<ConversationTurn>,
  ): Promise<string> {
    // Create a complete turn object
    const newTurn: ConversationTurn = {
      id: turn.id || `turn-${nanoid()}`,
      timestamp: turn.timestamp || new Date(),
      query: turn.query || '',
      response: turn.response || '',
      userId: turn.userId || '',
      userName: turn.userName || '',
      metadata: turn.metadata || {},
    };
    
    return this.storage.addTurn(conversationId, newTurn);
  }

  /**
   * Get turns for a conversation
   * @param conversationId The conversation ID
   * @param limit Maximum number of turns
   * @param offset Number of turns to skip
   * @returns Array of turns
   */
  async getTurns(
    conversationId: string,
    limit?: number,
    offset?: number,
  ): Promise<ConversationTurn[]> {
    return this.storage.getTurns(conversationId, limit, offset);
  }

  /**
   * Add a summary to a conversation
   * @param conversationId The conversation ID
   * @param summary The summary to add
   * @returns The ID of the created summary
   */
  async addSummary(
    conversationId: string,
    summary: ConversationSummary,
  ): Promise<string> {
    return this.storage.addSummary(conversationId, summary);
  }

  /**
   * Get summaries for a conversation
   * @param conversationId The conversation ID
   * @returns Array of summaries
   */
  async getSummaries(conversationId: string): Promise<ConversationSummary[]> {
    return this.storage.getSummaries(conversationId);
  }

  /**
   * Get information about conversations
   * @param criteria Search criteria
   * @returns Array of conversation info objects
   */
  async findConversations(criteria: Record<string, unknown>): Promise<ConversationInfo[]> {
    return this.storage.findConversations(criteria);
  }

  /**
   * Get recent conversations
   * @param limit Maximum number of conversations
   * @param interfaceType Optional interface type filter
   * @returns Array of conversation info objects
   */
  async getRecentConversations(
    limit?: number,
    interfaceType?: 'cli' | 'matrix',
  ): Promise<ConversationInfo[]> {
    return this.storage.getRecentConversations(limit, interfaceType);
  }

  /**
   * Update metadata for a conversation
   * @param conversationId The conversation ID
   * @param metadata The metadata to update
   * @returns True if updated
   */
  async updateMetadata(
    conversationId: string,
    metadata: Record<string, unknown>,
  ): Promise<boolean> {
    return this.storage.updateMetadata(conversationId, metadata);
  }

  /**
   * Get the underlying storage implementation
   * @returns The storage implementation
   */
  getStorageImplementation(): ConversationStorage {
    return this.storage;
  }
}