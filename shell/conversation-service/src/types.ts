import type { Message, Conversation } from "./schema";

/**
 * Valid message roles in a conversation
 */
export type MessageRole = "user" | "assistant" | "system";

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
  startConversation(
    sessionId: string,
    interfaceType: string,
    channelId: string,
  ): Promise<string>;
  addMessage(
    conversationId: string,
    role: MessageRole,
    content: string,
    metadata?: Record<string, unknown>,
  ): Promise<void>;
  getMessages(conversationId: string, limit?: number): Promise<Message[]>;
  getConversation(conversationId: string): Promise<Conversation | null>;

  // Search operations
  searchConversations(
    query: string,
    sessionId?: string,
  ): Promise<Conversation[]>;

  // Working memory
  getWorkingMemory(conversationId: string): Promise<string>;
}
