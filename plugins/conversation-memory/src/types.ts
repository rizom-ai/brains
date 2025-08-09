import { z } from "zod";
import type { Message, Conversation } from "./schema/conversations";

/**
 * Configuration schema for the conversation memory plugin
 */
export const conversationMemoryConfigSchema = z.object({
  databaseUrl: z.string().optional(),

  summarization: z
    .object({
      minMessages: z.number().default(20),
      minTimeMinutes: z.number().default(60),
      idleTimeMinutes: z.number().default(30),
      enableAutomatic: z.boolean().default(true),
      batchSize: z.number().default(20),
      overlapPercentage: z.number().default(0.25),
      similarityThreshold: z.number().default(0.7),
      targetLength: z.number().default(400),
      maxLength: z.number().default(1000),
    })
    .optional(),

  retention: z
    .object({
      unlimited: z.boolean().default(true),
      daysToKeep: z.number().default(30),
    })
    .optional(),
});

export type ConversationMemoryConfig = z.input<
  typeof conversationMemoryConfigSchema
>;

/**
 * Service interface for conversation memory
 */
export interface IConversationMemoryService {
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

  // Summarization
  checkSummarizationNeeded(conversationId: string): Promise<boolean>;
  createSummary(conversationId: string): Promise<void>;

  // Search
  searchConversations(
    sessionId: string,
    query: string,
  ): Promise<SearchResult[]>;

  // Context
  getConversationContext(conversationId: string): Promise<ConversationContext>;
}

/**
 * Search result schema (for MCP tool responses)
 */
export const searchResultSchema = z.object({
  conversationId: z.string(),
  excerpt: z.string(),
  timestamp: z.string(),
  relevance: z.number(),
});

export type SearchResult = z.infer<typeof searchResultSchema>;

/**
 * Schema for conversation summary entity metadata
 */
export const conversationSummaryMetadataSchema = z.object({
  sessionId: z.string(),
  conversationId: z.string(),
  interfaceType: z.string(),
  messageCount: z.number(),
});

export type ConversationSummaryMetadata = z.infer<
  typeof conversationSummaryMetadataSchema
>;

/**
 * Conversation context schema (for MCP tool responses)
 */
export const conversationContextSchema = z.object({
  conversationId: z.string(),
  sessionId: z.string(),
  messageCount: z.number(),
  started: z.string(),
  lastActive: z.string(),
  recentTopics: z.array(z.string()).optional(),
  entities: z.array(z.string()).optional(),
});

export type ConversationContext = z.infer<typeof conversationContextSchema>;
