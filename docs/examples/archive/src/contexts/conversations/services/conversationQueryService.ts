/**
 * Conversation Query Service
 * 
 * Handles conversation searches and retrieval operations.
 * 
 * Implements the Component Interface Standardization pattern with:
 * - getInstance(): Returns the singleton instance
 * - resetInstance(): Resets the singleton instance (mainly for testing)
 * - createFresh(): Creates a new instance without affecting the singleton
 */

import { nanoid } from 'nanoid';

import type { ConversationStorageAdapter } from '@/contexts/conversations/conversationStorageAdapter';
import type { ConversationInfo, SearchCriteria } from '@/contexts/conversations/storage/conversationStorage';
import type { Conversation } from '@/protocol/schemas/conversationSchemas';
import { Logger } from '@/utils/logger';

/**
 * Service for handling conversation queries and retrieval
 * Follows the Component Interface Standardization pattern
 */
export class ConversationQueryService {
  /** The singleton instance */
  private static instance: ConversationQueryService | null = null;
  
  /** Logger instance for this class */
  private logger = Logger.getInstance();

  /**
   * Get the singleton instance of ConversationQueryService
   * 
   * @param storageAdapter The storage adapter to use (only used when creating a new instance)
   * @returns The shared ConversationQueryService instance
   */
  public static getInstance(storageAdapter: ConversationStorageAdapter): ConversationQueryService {
    if (!ConversationQueryService.instance) {
      ConversationQueryService.instance = new ConversationQueryService(storageAdapter);
    }
    return ConversationQueryService.instance;
  }
  
  /**
   * Reset the singleton instance (primarily for testing)
   * This clears the instance and any resources it holds
   */
  public static resetInstance(): void {
    ConversationQueryService.instance = null;
  }
  
  /**
   * Create a fresh instance (primarily for testing)
   * This creates a new instance without affecting the singleton
   * 
   * @param storageAdapter The storage adapter to use
   * @returns A new ConversationQueryService instance
   */
  public static createFresh(storageAdapter: ConversationStorageAdapter): ConversationQueryService {
    return new ConversationQueryService(storageAdapter);
  }
  
  /**
   * Constructor
   * 
   * @param storageAdapter The storage adapter to use
   */
  private constructor(private storageAdapter: ConversationStorageAdapter) {
    this.logger.debug('ConversationQueryService initialized', { context: 'ConversationQueryService' });
  }

  /**
   * Create a new conversation
   * 
   * @param interfaceType The interface type (cli or matrix)
   * @param roomId The room ID
   * @returns The ID of the created conversation
   */
  async createConversation(interfaceType: 'cli' | 'matrix', roomId: string): Promise<string> {
    return this.storageAdapter.create({
      id: `conv-${nanoid()}`,
      interfaceType,
      roomId,
      createdAt: new Date(),
      updatedAt: new Date(),
      metadata: {},
    });
  }

  /**
   * Get a conversation by ID
   * 
   * @param conversationId The conversation ID
   * @returns The conversation or null if not found
   */
  async getConversation(conversationId: string): Promise<Conversation | null> {
    return this.storageAdapter.read(conversationId);
  }

  /**
   * Get a conversation ID by room ID
   * 
   * @param roomId The room ID
   * @param interfaceType Optional interface type filter
   * @returns Conversation ID or null if not found
   */
  async getConversationIdByRoom(
    roomId: string,
    interfaceType?: 'cli' | 'matrix',
  ): Promise<string | null> {
    return this.storageAdapter.getConversationByRoom(roomId, interfaceType);
  }

  /**
   * Get or create a conversation for a room
   * 
   * @param roomId The room ID
   * @param interfaceType The interface type
   * @returns The conversation ID
   */
  async getOrCreateConversationForRoom(
    roomId: string,
    interfaceType: 'cli' | 'matrix',
  ): Promise<string> {
    return this.storageAdapter.getOrCreateConversation(roomId, interfaceType);
  }

  /**
   * Find conversations matching search criteria
   * 
   * @param criteria Search criteria
   * @returns Array of matching conversations
   */
  async findConversations(criteria: SearchCriteria): Promise<ConversationInfo[]> {
    // Convert the specific SearchCriteria to a generic Record<string, unknown>
    const genericCriteria: Record<string, unknown> = {};
    Object.entries(criteria).forEach(([key, value]) => {
      genericCriteria[key] = value;
    });

    return this.storageAdapter.findConversations(genericCriteria);
  }

  /**
   * Get conversations for a specific room
   * 
   * @param roomId The room ID
   * @param interfaceType Optional interface type filter
   * @returns Array of conversation info objects
   */
  async getConversationsByRoom(
    roomId: string,
    interfaceType?: 'cli' | 'matrix',
  ): Promise<ConversationInfo[]> {
    return this.storageAdapter.findConversations({
      roomId,
      interfaceType,
    });
  }

  /**
   * Get recent conversations
   * 
   * @param limit Maximum number of conversations to return
   * @param interfaceType Optional interface type filter
   * @returns Array of conversation info objects
   */
  async getRecentConversations(
    limit?: number,
    interfaceType?: 'cli' | 'matrix',
  ): Promise<ConversationInfo[]> {
    return this.storageAdapter.getRecentConversations(limit, interfaceType);
  }

  /**
   * Update conversation metadata
   * 
   * @param conversationId The conversation ID
   * @param metadata The metadata to update
   * @returns True if updated successfully
   */
  async updateMetadata(
    conversationId: string,
    metadata: Record<string, unknown>,
  ): Promise<boolean> {
    return this.storageAdapter.updateMetadata(conversationId, metadata);
  }

  /**
   * Delete a conversation
   * 
   * @param conversationId The conversation ID
   * @returns True if deleted successfully
   */
  async deleteConversation(conversationId: string): Promise<boolean> {
    return this.storageAdapter.delete(conversationId);
  }
}