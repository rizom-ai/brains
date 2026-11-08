import { z } from "@brains/utils/zod";
import type { GuestConversationOwnership } from "@brains/contracts/chat";
import {
  actorRefSchema,
  defineChannel,
  messageRoleSchema,
  type Channel,
  type MessageRole,
} from "@brains/contracts";
import type { Message, Conversation } from "./schema";
import { isRecord } from "@brains/utils/is-record";

/** Source kind for projections that derive entities from conversation events. */
export const CONVERSATION_SOURCE_KIND = "conversation";

/** Bus channel emitted when a new message is appended to a conversation. */
export const CONVERSATION_MESSAGE_ADDED_CHANNEL = "conversation:messageAdded";

/**
 * Bus channel emitted when a message is appended to a guest conversation. It
 * says where the message is, never what it says: a plugin that wants the text
 * reads it through its conversation access, which honours guest expiry.
 */
export const CONVERSATION_GUEST_MESSAGE_ADDED_CHANNEL =
  "conversation:guestMessageAdded";

type ConversationMessageAddedPayloadSchema = z.ZodObject<{
  conversationId: z.ZodString;
  messageId: z.ZodString;
  role: typeof messageRoleSchema;
  content: z.ZodString;
  metadata: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
  timestamp: z.ZodString;
}>;

/**
 * A message was stored, with what it says and the metadata its writer gave
 * it. Each metadata key belongs to whoever writes it, so a subscriber reads
 * the keys it knows with their own schemas.
 */
export const conversationMessageAddedPayloadSchema: ConversationMessageAddedPayloadSchema =
  z.object({
    conversationId: z.string().min(1),
    messageId: z.string().min(1),
    role: messageRoleSchema,
    content: z.string(),
    metadata: z.record(z.string(), z.unknown()).optional(),
    timestamp: z.string(),
  });

export type ConversationMessageAddedPayload = z.output<
  typeof conversationMessageAddedPayloadSchema
>;

export const conversationMessageAddedChannel: Channel<
  ConversationMessageAddedPayload,
  unknown,
  typeof CONVERSATION_MESSAGE_ADDED_CHANNEL
> = defineChannel(
  CONVERSATION_MESSAGE_ADDED_CHANNEL,
  conversationMessageAddedPayloadSchema,
);

type ConversationGuestMessageAddedPayloadSchema = z.ZodObject<{
  conversationId: z.ZodString;
  messageId: z.ZodString;
  role: typeof messageRoleSchema;
  position: z.ZodNumber;
}>;

/** A guest message was stored: where it is, never what it says. */
export const conversationGuestMessageAddedPayloadSchema: ConversationGuestMessageAddedPayloadSchema =
  z.object({
    conversationId: z.string().min(1),
    messageId: z.string().min(1),
    role: messageRoleSchema,
    position: z.number().int().positive(),
  });

export type ConversationGuestMessageAddedPayload = z.output<
  typeof conversationGuestMessageAddedPayloadSchema
>;

export const conversationGuestMessageAddedChannel: Channel<
  ConversationGuestMessageAddedPayload,
  unknown,
  typeof CONVERSATION_GUEST_MESSAGE_ADDED_CHANNEL
> = defineChannel(
  CONVERSATION_GUEST_MESSAGE_ADDED_CHANNEL,
  conversationGuestMessageAddedPayloadSchema,
);

/** Bus channel emitted when a new conversation is started. */
export const CONVERSATION_STARTED_CHANNEL = "conversation:started";

/**
 * Metadata for a conversation
 */
export interface ConversationMetadata {
  guest?: GuestConversationOwnership;
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
  personId?: string;
  metadata: ConversationMetadata;
}

export const conversationMessageActorSchema: z.ZodObject<{
  identity: typeof actorRefSchema;
  interfaceType: z.ZodString;
  role: typeof messageRoleSchema;
  displayName: z.ZodOptional<z.ZodString>;
  username: z.ZodOptional<z.ZodString>;
  isBot: z.ZodOptional<z.ZodBoolean>;
}> = z.object({
  identity: actorRefSchema,
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

export const conversationMessageMetadataSchema: z.ZodObject<
  {
    actor: z.ZodOptional<typeof conversationMessageActorSchema>;
    source: z.ZodOptional<typeof conversationMessageSourceSchema>;
    spaceId: z.ZodOptional<z.ZodString>;
  },
  z.core.$loose
> = z.looseObject({
  actor: conversationMessageActorSchema.optional(),
  source: conversationMessageSourceSchema.optional(),
  /** The configured space a passively stored message belongs to, e.g. "discord:<channel id>". */
  spaceId: z.string().min(1).optional(),
});

export type ConversationMessageMetadata = z.output<
  typeof conversationMessageMetadataSchema
>;

export function parseConversationMessageMetadata(
  metadata: unknown,
): Record<string, unknown> | null {
  if (typeof metadata === "string") {
    try {
      const parsed: unknown = JSON.parse(metadata);
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
  offset?: number;
  /** Match title or message text literally, case-insensitively. */
  query?: string;
  /** Omit to include both active and archived conversations. */
  archived?: boolean;
  updatedAfter?: string;
  interfaceType?: string;
  sessionId?: string;
  channelId?: string;
  personId?: string;
}

export interface IConversationService {
  /** Settle non-fatal database readiness work (connection pragmas). */
  initialize?(): Promise<void>;
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
  /** Trusted host maintenance; never an anonymous conversation action. */
  deleteExpiredGuestConversations(limit?: number): Promise<number>;

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
 * Database configuration for conversation service
 */
export type { DbConfig as ConversationDbConfig } from "@brains/contracts";
