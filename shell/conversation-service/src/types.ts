import { z } from "@brains/utils/zod";
import { messageRoleSchema, type MessageRole } from "@brains/contracts";
import type { Message, Conversation } from "./schema";

/** Source kind for projections that derive entities from conversation events. */
export const CONVERSATION_SOURCE_KIND = "conversation";

/** Bus channel emitted when a new message is appended to a conversation. */
export const CONVERSATION_MESSAGE_ADDED_CHANNEL = "conversation:messageAdded";

/** Bus channel emitted when a new conversation is started. */
export const CONVERSATION_STARTED_CHANNEL = "conversation:started";

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

export interface StartConversationRequest {
  sessionId: string;
  interfaceType: string;
  channelId: string;
  metadata: ConversationMetadata;
}

export const conversationMessageActorSchema: z.ZodObject<{
  actorId: z.ZodString;
  canonicalId: z.ZodOptional<z.ZodString>;
  interfaceType: z.ZodString;
  role: typeof messageRoleSchema;
  displayName: z.ZodOptional<z.ZodString>;
  username: z.ZodOptional<z.ZodString>;
  isBot: z.ZodOptional<z.ZodBoolean>;
}> = z.object({
  actorId: z.string(),
  canonicalId: z.string().optional(),
  interfaceType: z.string(),
  role: messageRoleSchema,
  displayName: z.string().optional(),
  username: z.string().optional(),
  isBot: z.boolean().optional(),
});

export type ConversationMessageActor = z.output<
  typeof conversationMessageActorSchema
>;

export const conversationMessageSourceSchema: z.ZodObject<{
  messageId: z.ZodOptional<z.ZodString>;
  channelId: z.ZodOptional<z.ZodString>;
  channelName: z.ZodOptional<z.ZodString>;
  threadId: z.ZodOptional<z.ZodString>;
  metadata: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
}> = z.object({
  messageId: z.string().optional(),
  channelId: z.string().optional(),
  channelName: z.string().optional(),
  threadId: z.string().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export type ConversationMessageSource = z.output<
  typeof conversationMessageSourceSchema
>;

export interface ConversationMessageMetadata {
  [key: string]: unknown;
  actor?: ConversationMessageActor | undefined;
  source?: ConversationMessageSource | undefined;
}

export const conversationMessageMetadataSchema: z.ZodType<
  ConversationMessageMetadata,
  unknown
> = z.looseObject({
  actor: conversationMessageActorSchema.optional(),
  source: conversationMessageSourceSchema.optional(),
});

export function parseConversationMessageMetadata(
  metadata: unknown,
): Record<string, unknown> | null {
  if (typeof metadata === "string") {
    try {
      const parsed = JSON.parse(metadata) as unknown;
      return isRecord(parsed) ? parsed : null;
    } catch {
      return null;
    }
  }
  return isRecord(metadata) ? metadata : null;
}

export function isSavableAssistantMessage(
  message: Pick<Message, "role" | "content" | "metadata">,
): boolean {
  if (message.role !== "assistant") return false;
  if (message.content.trim().length === 0) return false;

  const metadata = parseConversationMessageMetadata(message.metadata);
  const entityMemoryRefs = metadata?.["entityMemoryRefs"];
  if (Array.isArray(entityMemoryRefs) && entityMemoryRefs.length > 0) {
    return false;
  }

  const cards = metadata?.["cards"];
  if (!Array.isArray(cards)) return true;
  return !cards.some((card) => {
    if (!isRecord(card)) return false;
    if (card["kind"] === "tool-approval") return true;
    return card["kind"] === "actions" && card["id"] === "actions:upload-intent";
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export interface AddConversationMessageRequest {
  conversationId: string;
  role: MessageRole;
  content: string;
  metadata?: Record<string, unknown>;
}

export interface UpdateConversationMetadataRequest {
  conversationId: string;
  metadata: Record<string, unknown>;
}

export interface ListConversationsOptions {
  limit?: number;
  updatedAfter?: string;
  interfaceType?: string;
  sessionId?: string;
  channelId?: string;
}

export interface IConversationService {
  // Core operations
  startConversation(request: StartConversationRequest): Promise<string>;
  addMessage(request: AddConversationMessageRequest): Promise<void>;
  getMessages(
    conversationId: string,
    options?: GetMessagesOptions,
  ): Promise<Message[]>;
  countMessages(conversationId: string): Promise<number>;
  getConversation(conversationId: string): Promise<Conversation | null>;
  listConversations(
    options?: ListConversationsOptions,
  ): Promise<Conversation[]>;
  updateConversationMetadata(
    request: UpdateConversationMetadataRequest,
  ): Promise<boolean>;
  deleteConversation(conversationId: string): Promise<boolean>;

  // Search operations
  searchConversations(
    query: string,
    sessionId?: string,
  ): Promise<Conversation[]>;

  // Lifecycle
  close(): void;
}

/**
 * Schema for Message validation - manually defined to match Drizzle Message type
 * Note: role is string in DB schema, but we validate it as enum for payload validation
 */
export const messageSchema: z.ZodObject<{
  id: z.ZodString;
  conversationId: z.ZodString;
  role: z.ZodString;
  content: z.ZodString;
  timestamp: z.ZodString;
  metadata: z.ZodNullable<z.ZodString>;
}> = z.object({
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
export const conversationDigestPayloadSchema: z.ZodObject<{
  conversationId: z.ZodString;
  messageCount: z.ZodNumber;
  messages: z.ZodArray<typeof messageSchema>;
  windowStart: z.ZodNumber;
  windowEnd: z.ZodNumber;
  windowSize: z.ZodNumber;
  timestamp: z.ZodString;
}> = z.object({
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
export type ConversationDigestPayload = z.output<
  typeof conversationDigestPayloadSchema
>;

/**
 * Database configuration for conversation service
 */
export type { DbConfig as ConversationDbConfig } from "@brains/contracts";
