import type { Message, Conversation } from "./schema";

/**
 * Valid message roles in a conversation
 */
export type MessageRole = "user" | "assistant" | "system";

/**
 * Configuration for ConversationService
 */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface ConversationServiceConfig {
  // Currently no configuration needed
}

/**
 * Service interface for conversation storage
 */
/**
 * Options for retrieving messages
 */
export interface GetMessagesOptions {
  limit?: number; // Limit number of messages (for recent messages)
  range?: {
    // Get specific range of messages (1-based indexing)
    start: number;
    end: number;
  };
}

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
  getMessages(
    conversationId: string,
    options?: GetMessagesOptions,
  ): Promise<Message[]>;
  getConversation(conversationId: string): Promise<Conversation | null>;

  // Search operations
  searchConversations(
    query: string,
    sessionId?: string,
  ): Promise<Conversation[]>;
}
