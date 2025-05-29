/**
 * In-memory implementation of ConversationStorage
 * 
 * Implements the Component Interface Standardization pattern with:
 * - getInstance(): Returns the singleton instance
 * - resetInstance(): Resets the singleton instance (mainly for testing)
 * - createFresh(): Creates a new instance without affecting the singleton
 */
import { nanoid } from 'nanoid';

import type { Conversation, ConversationTurn } from '@/protocol/schemas/conversationSchemas';
import { Logger } from '@/utils/logger';

import type {
  ConversationInfo,
  ConversationStorage,
  ConversationSummary,
  NewConversation,
  SearchCriteria,
} from './conversationStorage';

/**
 * Configuration options for InMemoryStorage
 */
export interface InMemoryStorageConfig {
  /**
   * Initial conversations to populate the storage with
   */
  initialConversations?: Map<string, Conversation>;
  
  /**
   * Initial turns to populate the storage with
   */
  initialTurns?: Map<string, ConversationTurn[]>;
  
  /**
   * Initial summaries to populate the storage with
   */
  initialSummaries?: Map<string, ConversationSummary[]>;
  
  /**
   * Whether to log verbose debug information
   */
  verbose?: boolean;
  
  /**
   * Whether to disable all logging (useful for tests)
   */
  silent?: boolean;
}

/**
 * In-memory storage for conversations
 * This implementation stores all data in memory and is lost when the process restarts
 * 
 * Follows the Component Interface Standardization pattern with getInstance(),
 * resetInstance(), and createFresh() methods.
 */
export class InMemoryStorage implements ConversationStorage {
  private static instance: InMemoryStorage | null = null;
  
  private conversations: Map<string, Conversation> = new Map();
  private turns: Map<string, ConversationTurn[]> = new Map();
  private summaries: Map<string, ConversationSummary[]> = new Map();
  private roomIndex: Map<string, string> = new Map();
  private verbose: boolean = false;
  private silent: boolean = false;
  
  private logger = Logger.getInstance();

  /**
   * Private constructor to enforce the use of getInstance() or createFresh()
   * 
   * @param config - Optional configuration options
   */
  private constructor(config?: InMemoryStorageConfig) {
    // Initialize storage with configuration if provided
    if (config) {
      if (config.initialConversations) {
        this.conversations = new Map(config.initialConversations);
      }
      
      if (config.initialTurns) {
        this.turns = new Map(config.initialTurns);
      }
      
      if (config.initialSummaries) {
        this.summaries = new Map(config.initialSummaries);
      }
      
      if (config.verbose !== undefined) {
        this.verbose = config.verbose;
      }
      
      if (config.silent !== undefined) {
        this.silent = config.silent;
      }
      
      // Rebuild room index from conversations
      this.rebuildRoomIndex();
    }
    
    // Only log if not in silent mode
    if (this.verbose && !this.silent) {
      this.logger.debug('InMemoryStorage instance created');
    }
  }

  /**
   * Get the singleton instance of InMemoryStorage
   * 
   * @param config - Optional configuration options (only used when creating a new instance)
   * @returns The singleton instance
   */
  public static getInstance(config?: InMemoryStorageConfig): InMemoryStorage {
    const isSilent = config?.silent === true;
    
    if (!InMemoryStorage.instance) {
      InMemoryStorage.instance = new InMemoryStorage(config);
      
      // Log instance creation but only on first creation and if not silent
      if (!isSilent) {
        const logger = Logger.getInstance();
        logger.debug('InMemoryStorage singleton instance created');
      }
    } else if (config && !isSilent) {
      // Log a warning if trying to get instance with different config (and not silent)
      const logger = Logger.getInstance();
      logger.warn('getInstance called with config but instance already exists. Config ignored.');
    }
    
    return InMemoryStorage.instance;
  }

  /**
   * Reset the singleton instance
   * This is primarily used for testing to ensure a clean state between tests
   */
  public static resetInstance(): void {
    if (InMemoryStorage.instance) {
      const isSilent = InMemoryStorage.instance.silent;
      
      // Clear all data before resetting
      InMemoryStorage.instance.clear();
      InMemoryStorage.instance = null;
      
      // Only log if not in silent mode
      if (!isSilent) {
        const logger = Logger.getInstance();
        logger.debug('InMemoryStorage singleton instance reset');
      }
    }
  }
  
  /**
   * Create a fresh instance that is not the singleton
   * This method is primarily used for testing to create isolated instances
   * 
   * @param config - Optional configuration options
   * @returns A new InMemoryStorage instance
   */
  public static createFresh(config?: InMemoryStorageConfig): InMemoryStorage {
    const isSilent = config?.silent === true;
    
    // Only log if not in silent mode
    if (!isSilent) {
      const logger = Logger.getInstance();
      logger.debug('Creating fresh InMemoryStorage instance');
    }
    
    // Create a new instance and explicitly initialize according to config
    return new InMemoryStorage(config);
  }
  
  /**
   * Rebuild the room index from conversations
   * This is used when initializing with pre-populated conversations
   */
  private rebuildRoomIndex(): void {
    this.roomIndex.clear();
    
    for (const conversation of this.conversations.values()) {
      const roomKey = this.getRoomKey(conversation.roomId, conversation.interfaceType);
      this.roomIndex.set(roomKey, conversation.id);
    }
  }

  /**
   * Create a new conversation
   * @param conversation New conversation data
   * @returns The ID of the created conversation
   */
  async createConversation(conversation: NewConversation): Promise<string> {
    // Generate ID if not provided
    const id = conversation.id || `conv-${nanoid()}`;
    
    // Create conversation object
    const newConversation: Conversation = {
      id,
      interfaceType: conversation.interfaceType,
      roomId: conversation.roomId,
      createdAt: conversation.startedAt || new Date(),
      updatedAt: conversation.updatedAt || new Date(),
      metadata: conversation.metadata || {},
      activeTurns: [],
      summaries: [],
      archivedTurns: [],
    };
    
    // Store conversation
    this.conversations.set(id, newConversation);
    
    // Initialize turns and summaries for this conversation
    this.turns.set(id, []);
    this.summaries.set(id, []);
    
    // Index by room ID and interface type for quick lookups
    const roomKey = this.getRoomKey(conversation.roomId, conversation.interfaceType);
    this.roomIndex.set(roomKey, id);
    
    // Only log if not in silent mode and verbose logging is enabled
    if (this.verbose && !this.silent) {
      this.logger.debug(`Created conversation ${id} for room ${conversation.roomId}`);
    }
    return id;
  }

  /**
   * Get a conversation by ID
   * @param conversationId The conversation ID
   * @returns The conversation object or null if not found
   */
  async getConversation(conversationId: string): Promise<Conversation | null> {
    const conversation = this.conversations.get(conversationId);
    
    if (!conversation) {
      return null;
    }
    
    return { ...conversation };
  }

  /**
   * Get a conversation by room ID and interface type
   * @param roomId The room ID
   * @param interfaceType The interface type (defaults to both)
   * @returns The conversation ID or null if not found
   */
  async getConversationByRoom(
    roomId: string, 
    interfaceType?: 'cli' | 'matrix',
  ): Promise<string | null> {
    // Try each interface type if not specified
    if (!interfaceType) {
      // Try matrix first, then cli
      const matrixKey = this.getRoomKey(roomId, 'matrix');
      const cliKey = this.getRoomKey(roomId, 'cli');
      
      const matrixConversationId = this.roomIndex.get(matrixKey);
      if (matrixConversationId) {
        return matrixConversationId;
      }
      
      return this.roomIndex.get(cliKey) || null;
    }
    
    // Look up by room key
    const roomKey = this.getRoomKey(roomId, interfaceType);
    return this.roomIndex.get(roomKey) || null;
  }

  /**
   * Update a conversation
   * @param conversationId The conversation ID
   * @param updates The updates to apply
   * @returns true if updated, false if not found
   */
  async updateConversation(
    conversationId: string,
    updates: Partial<Conversation>,
  ): Promise<boolean> {
    const conversation = this.conversations.get(conversationId);
    
    if (!conversation) {
      return false;
    }
    
    // Apply updates
    const updatedConversation = {
      ...conversation,
      ...updates,
      updatedAt: new Date(),
    };
    
    // Store updated conversation
    this.conversations.set(conversationId, updatedConversation);
    
    // If room ID changed, update the room index
    if (updates.roomId && updates.roomId !== conversation.roomId) {
      // Remove old index
      const oldRoomKey = this.getRoomKey(conversation.roomId, conversation.interfaceType);
      this.roomIndex.delete(oldRoomKey);
      
      // Add new index
      const newRoomKey = this.getRoomKey(
        updates.roomId, 
        updates.interfaceType || conversation.interfaceType,
      );
      this.roomIndex.set(newRoomKey, conversationId);
    }
    
    return true;
  }

  /**
   * Delete a conversation
   * @param conversationId The conversation ID
   * @returns true if deleted, false if not found
   */
  async deleteConversation(conversationId: string): Promise<boolean> {
    const conversation = this.conversations.get(conversationId);
    
    if (!conversation) {
      return false;
    }
    
    // Remove from room index
    const roomKey = this.getRoomKey(conversation.roomId, conversation.interfaceType);
    this.roomIndex.delete(roomKey);
    
    // Remove conversation and its turns/summaries
    this.conversations.delete(conversationId);
    this.turns.delete(conversationId);
    this.summaries.delete(conversationId);
    
    return true;
  }

  /**
   * Add a turn to a conversation
   * @param conversationId The conversation ID
   * @param turn The turn to add
   * @returns The ID of the created turn
   */
  async addTurn(conversationId: string, turn: ConversationTurn): Promise<string> {
    const conversation = this.conversations.get(conversationId);
    
    if (!conversation) {
      throw new Error(`Conversation with ID ${conversationId} not found`);
    }
    
    // Generate ID if not provided
    const turnId = turn.id || `turn-${nanoid()}`;
    
    // Create turn object
    const newTurn: ConversationTurn = {
      ...turn,
      id: turnId,
      timestamp: turn.timestamp || new Date(),
      metadata: turn.metadata || {},
    };
    
    // Get existing turns and add new turn
    const conversationTurns = this.turns.get(conversationId) || [];
    conversationTurns.push(newTurn);
    this.turns.set(conversationId, conversationTurns);
    
    // Update conversation's updatedAt
    this.conversations.set(conversationId, {
      ...conversation,
      updatedAt: new Date(),
    });
    
    return turnId;
  }

  /**
   * Get turns for a conversation
   * @param conversationId The conversation ID
   * @param limit Maximum number of turns to return
   * @param offset Number of turns to skip
   * @returns Array of conversation turns
   */
  async getTurns(
    conversationId: string,
    limit?: number,
    offset?: number,
  ): Promise<ConversationTurn[]> {
    const turns = this.turns.get(conversationId) || [];
    
    // Sort by timestamp
    const sortedTurns = [...turns].sort(
      (a, b) => {
        const aTime = a.timestamp ? new Date(a.timestamp).getTime() : 0;
        const bTime = b.timestamp ? new Date(b.timestamp).getTime() : 0;
        return aTime - bTime;
      },
    );
    
    // Apply pagination if specified
    if (offset !== undefined || limit !== undefined) {
      const start = offset || 0;
      const end = limit ? start + limit : undefined;
      return sortedTurns.slice(start, end);
    }
    
    return sortedTurns;
  }

  /**
   * Update a turn
   * @param turnId The turn ID
   * @param updates The updates to apply
   * @returns true if updated, false if not found
   */
  async updateTurn(turnId: string, updates: Partial<ConversationTurn>): Promise<boolean> {
    // Find the turn in all conversations
    for (const [conversationId, turns] of this.turns.entries()) {
      const turnIndex = turns.findIndex(t => t.id === turnId);
      
      if (turnIndex !== -1) {
        // Update the turn
        const updatedTurn = {
          ...turns[turnIndex],
          ...updates,
        };
        
        turns[turnIndex] = updatedTurn;
        this.turns.set(conversationId, turns);
        
        // Update conversation's updatedAt
        const conversation = this.conversations.get(conversationId);
        if (conversation) {
          this.conversations.set(conversationId, {
            ...conversation,
            updatedAt: new Date(),
          });
        }
        
        return true;
      }
    }
    
    return false;
  }

  /**
   * Add a summary to a conversation
   * @param conversationId The conversation ID
   * @param summary The summary to add
   * @returns The ID of the created summary
   */
  async addSummary(conversationId: string, summary: ConversationSummary): Promise<string> {
    const conversation = this.conversations.get(conversationId);
    
    if (!conversation) {
      throw new Error(`Conversation with ID ${conversationId} not found`);
    }
    
    // Generate ID if not provided
    const summaryId = summary.id || `summ-${nanoid()}`;
    
    // Create summary object
    const newSummary: ConversationSummary = {
      ...summary,
      id: summaryId,
      conversationId,
      createdAt: summary.createdAt || new Date(),
      metadata: summary.metadata || {},
    };
    
    // Get existing summaries and add new summary
    const conversationSummaries = this.summaries.get(conversationId) || [];
    conversationSummaries.push(newSummary);
    this.summaries.set(conversationId, conversationSummaries);
    
    return summaryId;
  }

  /**
   * Get summaries for a conversation
   * @param conversationId The conversation ID
   * @returns Array of conversation summaries
   */
  async getSummaries(conversationId: string): Promise<ConversationSummary[]> {
    return this.summaries.get(conversationId) || [];
  }

  /**
   * Find conversations matching criteria
   * @param criteria Search criteria
   * @returns Array of matching conversations
   */
  async findConversations(criteria: SearchCriteria): Promise<ConversationInfo[]> {
    let results: ConversationInfo[] = [];
    
    // Convert conversations to info objects
    for (const conversation of this.conversations.values()) {
      // Apply interface type filter
      if (criteria.interfaceType && conversation.interfaceType !== criteria.interfaceType) {
        continue;
      }
      
      // Apply room ID filter
      if (criteria.roomId && conversation.roomId !== criteria.roomId) {
        continue;
      }
      
      // Apply date range filters
      if (criteria.startDate && new Date(conversation.createdAt) < new Date(criteria.startDate)) {
        continue;
      }
      
      if (criteria.endDate && new Date(conversation.createdAt) > new Date(criteria.endDate)) {
        continue;
      }
      
      // Apply text search if provided
      if (criteria.query) {
        const turns = this.turns.get(conversation.id) || [];
        const matchingTurn = turns.some(turn => {
          const lowerQuery = criteria.query!.toLowerCase();
          return (
            turn.query.toLowerCase().includes(lowerQuery) ||
            turn.response.toLowerCase().includes(lowerQuery)
          );
        });
        
        if (!matchingTurn) {
          continue;
        }
      }
      
      // Get turn count
      const turnCount = (this.turns.get(conversation.id) || []).length;
      
      // Add to results
      results.push({
        id: conversation.id,
        interfaceType: conversation.interfaceType,
        roomId: conversation.roomId,
        startedAt: conversation.createdAt,
        updatedAt: conversation.updatedAt,
        turnCount,
        metadata: conversation.metadata,
      });
    }
    
    // Sort by most recently updated
    results.sort((a, b) => 
      new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
    );
    
    // Apply pagination
    if (criteria.offset !== undefined || criteria.limit !== undefined) {
      const start = criteria.offset || 0;
      const end = criteria.limit ? start + criteria.limit : undefined;
      results = results.slice(start, end);
    }
    
    return results;
  }

  /**
   * Get recent conversations
   * @param limit Maximum number of conversations to return
   * @param interfaceType Optional filter by interface type
   * @returns Array of conversation info objects
   */
  async getRecentConversations(
    limit?: number,
    interfaceType?: 'cli' | 'matrix',
  ): Promise<ConversationInfo[]> {
    return this.findConversations({
      interfaceType,
      limit,
      // Sort newest first
      offset: 0,
    });
  }

  /**
   * Update metadata for a conversation
   * @param conversationId The conversation ID
   * @param metadata The metadata to update or add
   * @returns true if updated, false if not found
   */
  async updateMetadata(
    conversationId: string,
    metadata: Record<string, unknown>,
  ): Promise<boolean> {
    const conversation = this.conversations.get(conversationId);
    
    if (!conversation) {
      return false;
    }
    
    // Merge existing metadata with new metadata
    const updatedMetadata = {
      ...conversation.metadata,
      ...metadata,
    };
    
    // Update conversation
    this.conversations.set(conversationId, {
      ...conversation,
      metadata: updatedMetadata,
      updatedAt: new Date(),
    });
    
    return true;
  }

  /**
   * Get metadata for a conversation
   * @param conversationId The conversation ID
   * @returns Metadata object or null if not found
   */
  async getMetadata(conversationId: string): Promise<Record<string, unknown> | null> {
    const conversation = this.conversations.get(conversationId);
    
    if (!conversation) {
      return null;
    }
    
    return { ...conversation.metadata };
  }

  /**
   * Create a room key for indexing
   * @param roomId Room ID
   * @param interfaceType Interface type
   * @returns Room key string
   */
  private getRoomKey(roomId: string, interfaceType: 'cli' | 'matrix'): string {
    return `${interfaceType}:${roomId}`;
  }
  
  /**
   * Clear all data from this storage instance
   * Primarily used for testing
   */
  clear(): void {
    // Clear all collections
    this.conversations.clear();
    this.turns.clear();
    this.summaries.clear();
    this.roomIndex.clear();
    
    // Only log if not in silent mode and verbose logging is enabled
    if (this.verbose && !this.silent) {
      this.logger.debug('Cleared all data from InMemoryStorage');
    }
  }

}