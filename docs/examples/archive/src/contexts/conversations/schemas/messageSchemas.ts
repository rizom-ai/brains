/**
 * Conversation Context Message Schemas
 * 
 * This module defines Zod schemas for validating message parameters and payloads
 * specific to the Conversation context. These schemas ensure type safety and validation
 * for cross-context communication involving conversations.
 */

import { z } from 'zod';

import { DataRequestType, NotificationType } from '@/protocol/messaging/messageTypes';
import { ConversationTurnSchema } from '@/protocol/schemas/conversationSchemas';

/**
 * Schema for CONVERSATION_HISTORY request parameters
 * Used when requesting conversation history
 */
export const ConversationHistoryParamsSchema = z.object({
  /** ID of the conversation to retrieve history for */
  conversationId: z.string().min(1, 'Conversation ID is required'),
  /** Maximum number of turns to retrieve */
  limit: z.number().int().positive().optional(),
});

/**
 * Schema for CONVERSATION_STARTED notification payload
 * Used when notifying that a new conversation was started
 */
export const ConversationStartedPayloadSchema = z.object({
  /** ID of the conversation */
  id: z.string().min(1, 'Conversation ID is required'),
  /** Room ID the conversation is associated with */
  roomId: z.string(),
  /** Type of interface (cli or matrix) */
  interfaceType: z.enum(['cli', 'matrix']),
  /** Timestamp when the conversation was created */
  createdAt: z.date(),
});

/**
 * Schema for CONVERSATION_CLEARED notification payload
 * Used when notifying that a conversation was cleared
 */
export const ConversationClearedPayloadSchema = z.object({
  /** ID of the conversation that was cleared */
  id: z.string().min(1, 'Conversation ID is required'),
});

/**
 * Schema for CONVERSATION_TURN_ADDED notification payload
 * Used when notifying that a turn was added to a conversation
 */
export const ConversationTurnAddedPayloadSchema = z.object({
  /** ID of the conversation the turn was added to */
  conversationId: z.string().min(1, 'Conversation ID is required'),
  /** ID of the turn that was added */
  turnId: z.string(),
  /** Timestamp when the turn was added */
  timestamp: z.date(),
  /** ID of the user who added the turn */
  userId: z.string().optional(),
});

/**
 * Schema for creating a new conversation turn
 * Used when adding a turn to a conversation
 */
export const CreateConversationTurnParamsSchema = z.object({
  /** ID of the conversation to add the turn to */
  conversationId: z.string().min(1, 'Conversation ID is required'),
  /** The turn to add */
  turn: ConversationTurnSchema,
});

/**
 * Schema for creating a new conversation
 * Used when starting a new conversation
 */
export const CreateConversationParamsSchema = z.object({
  /** ID of the room to associate the conversation with */
  roomId: z.string().min(1, 'Room ID is required'),
  /** Type of interface (cli or matrix) */
  interfaceType: z.enum(['cli', 'matrix']),
  /** First turn of the conversation (optional) */
  initialTurn: ConversationTurnSchema.optional(),
});

/**
 * Map of message types to their schemas for this context
 * This allows for easy lookup of schemas by message type
 * and helps ensure schema coverage for all message types
 */
export const ConversationSchemaMap = {
  // Request parameter schemas
  [DataRequestType.CONVERSATION_HISTORY]: ConversationHistoryParamsSchema,
  
  // Notification payload schemas
  [NotificationType.CONVERSATION_STARTED]: ConversationStartedPayloadSchema,
  [NotificationType.CONVERSATION_CLEARED]: ConversationClearedPayloadSchema,
  [NotificationType.CONVERSATION_TURN_ADDED]: ConversationTurnAddedPayloadSchema,
  
  // Tool parameter schemas
  'conversation.create': CreateConversationParamsSchema,
  'conversation.addTurn': CreateConversationTurnParamsSchema,
} as const;

// Export derived types for use in type-safe code
export type ConversationHistoryParams = z.infer<typeof ConversationHistoryParamsSchema>;
export type ConversationStartedPayload = z.infer<typeof ConversationStartedPayloadSchema>;
export type ConversationClearedPayload = z.infer<typeof ConversationClearedPayloadSchema>;
export type ConversationTurnAddedPayload = z.infer<typeof ConversationTurnAddedPayloadSchema>;
export type CreateConversationTurnParams = z.infer<typeof CreateConversationTurnParamsSchema>;
export type CreateConversationParams = z.infer<typeof CreateConversationParamsSchema>;