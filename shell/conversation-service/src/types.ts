import { z } from "zod";
import type { Message, Conversation } from "./schema";

/**
 * Valid message roles in a conversation
 */
export type MessageRole = "user" | "assistant" | "system";

/**
 * Configuration for ConversationService
 */
export interface ConversationServiceConfig {
  // Digest configuration
  digestTriggerInterval?: number; // Trigger digest every N messages (default: 10)
  digestWindowSize?: number; // Size of message window in digest (default: 20)
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

/**
 * Schema for conversation digest payload validation
 */
export const conversationDigestPayloadSchema = z.object({
  conversationId: z.string(),
  messageCount: z.number(),
  messages: z.array(z.unknown()), // Messages schema would be complex, using unknown for now
  windowStart: z.number(),
  windowEnd: z.number(),
  windowSize: z.number(),
  timestamp: z.string(),
});

/**
 * Payload for conversation digest events
 * Broadcast every N messages with overlapping message windows
 */
export type ConversationDigestPayload = z.infer<typeof conversationDigestPayloadSchema>;
