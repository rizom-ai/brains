/**
 * Interface for conversation storage implementations
 * Defines methods for storing and retrieving conversations, turns, and summaries
 */

import type { Conversation, ConversationTurn } from '@/protocol/schemas/conversationSchemas';

/**
 * New conversation data for creation
 */
export interface NewConversation {
  id?: string;
  interfaceType: 'cli' | 'matrix';
  roomId: string;
  startedAt: Date;
  updatedAt: Date;
  metadata?: Record<string, unknown>;
}

/**
 * Conversation summary data
 */
export interface ConversationSummary {
  id: string;
  conversationId: string;
  content: string;
  startTurnId?: string;
  endTurnId?: string;
  createdAt: Date;
  metadata?: Record<string, unknown>;
  turnCount?: number; // Number of turns this summary represents
}

/**
 * Search criteria for finding conversations
 */
export interface SearchCriteria {
  interfaceType?: 'cli' | 'matrix';
  roomId?: string;
  query?: string;
  startDate?: Date;
  endDate?: Date;
  userId?: string;
  limit?: number;
  offset?: number;
}

/**
 * Basic information about a conversation
 */
export interface ConversationInfo {
  id: string;
  interfaceType: 'cli' | 'matrix';
  roomId: string;
  startedAt: Date;
  updatedAt: Date;
  turnCount: number;
  metadata?: Record<string, unknown>;
}

/**
 * Interface for conversation storage
 */
export interface ConversationStorage {
  // Conversation operations
  createConversation(conversation: NewConversation): Promise<string>;
  getConversation(conversationId: string): Promise<Conversation | null>;
  getConversationByRoom(roomId: string, interfaceType?: 'cli' | 'matrix'): Promise<string | null>;
  updateConversation(conversationId: string, updates: Partial<Conversation>): Promise<boolean>;
  deleteConversation(conversationId: string): Promise<boolean>;
  
  // Turn operations
  addTurn(conversationId: string, turn: ConversationTurn): Promise<string>;
  getTurns(conversationId: string, limit?: number, offset?: number): Promise<ConversationTurn[]>;
  updateTurn(turnId: string, updates: Partial<ConversationTurn>): Promise<boolean>;
  
  // Summary operations
  addSummary(conversationId: string, summary: ConversationSummary): Promise<string>;
  getSummaries(conversationId: string): Promise<ConversationSummary[]>;
  
  // Search and querying
  findConversations(criteria: SearchCriteria): Promise<ConversationInfo[]>;
  getRecentConversations(limit?: number, interfaceType?: 'cli' | 'matrix'): Promise<ConversationInfo[]>;
  
  // Metadata operations
  updateMetadata(conversationId: string, metadata: Record<string, unknown>): Promise<boolean>;
  getMetadata(conversationId: string): Promise<Record<string, unknown> | null>;
}