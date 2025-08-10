import type { Message, Conversation } from "./schema";

/**
 * Configuration for ConversationService
 */
export interface ConversationServiceConfig {
  workingMemorySize?: number; // Number of recent messages to keep in working memory (default: 20)
}

/**
 * Service interface for conversation storage
 */
export interface IConversationService {
  // Core operations
  startConversation(sessionId: string, interfaceType: string): Promise<string>;
  addMessage(
    conversationId: string,
    role: "user" | "assistant" | "system",
    content: string,
    metadata?: Record<string, unknown>,
  ): Promise<void>;
  getRecentMessages(conversationId: string, limit?: number): Promise<Message[]>;
  getConversation(conversationId: string): Promise<Conversation | null>;

  // Search operations
  searchConversations(
    query: string,
    sessionId?: string,
  ): Promise<Conversation[]>;

  // Working memory
  getWorkingMemory(conversationId: string): Promise<string>;
}
