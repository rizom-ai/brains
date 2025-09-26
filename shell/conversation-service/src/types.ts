import { z } from "@brains/utils";
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
 * Metadata for a conversation
 */
export interface ConversationMetadata {
  channelName: string; // Human-readable name for the channel/room
  interfaceType: string; // Interface that created the conversation (e.g., 'matrix', 'cli')
  channelId: string; // Original channel/room identifier
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
    metadata: ConversationMetadata,
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
 * Schema for Message validation - manually defined to match Drizzle Message type
 * Note: role is string in DB schema, but we validate it as enum for payload validation
 */
export const messageSchema = z.object({
  id: z.string(),
  conversationId: z.string(),
  role: z.string(), // Keep as string to match Drizzle type, enum validation happens at API boundaries
  content: z.string(),
  timestamp: z.string(),
  metadata: z.string().nullable(),
});

/**
 * Schema for conversation digest payload validation
 */
export const conversationDigestPayloadSchema = z.object({
  conversationId: z.string(),
  messageCount: z.number(),
  messages: z.array(messageSchema),
  windowStart: z.number(),
  windowEnd: z.number(),
  windowSize: z.number(),
  timestamp: z.string(),
});

/**
 * Payload for conversation digest events
 * Broadcast every N messages with overlapping message windows
 */
export type ConversationDigestPayload = z.infer<
  typeof conversationDigestPayloadSchema
>;

/**
 * Database configuration for conversation service
 */
export interface ConversationDbConfig {
  url: string; // Now required - no default
  authToken?: string;
}
