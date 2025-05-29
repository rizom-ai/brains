/**
 * Schema Registry
 * 
 * This module serves as a central registry for all message schemas across contexts.
 * It imports and re-exports schemas from each context, providing a single point of
 * access for validation and type information.
 */

// Import enums for mapping - these will be used when accessing MessageSchemaRegistry
// Leaving commented out for future usage once the registry is fully populated
// import { DataRequestType, NotificationType } from './messageTypes';

// Import necessary types

// Import schemas from contexts
import {
  ConversationClearedPayloadSchema,
  ConversationHistoryParamsSchema,
  ConversationSchemaMap,
  ConversationStartedPayloadSchema,
  ConversationTurnAddedPayloadSchema,
  CreateConversationParamsSchema,
  CreateConversationTurnParamsSchema,
} from '@/contexts/conversations/schemas/messageSchemas';
import {
  ExternalSourceAvailabilityNotificationSchema,
  ExternalSourceSchemaMap,
  ExternalSourceSearchNotificationSchema,
  ExternalSourceSearchRequestSchema,
  ExternalSourceStatusRequestSchema,
} from '@/contexts/externalSources/schemas/messageSchemas';
import {
  NoteByIdParamsSchema,
  NoteCreatedPayloadSchema,
  NoteDeletedPayloadSchema,
  NoteSchemaMap,
  NotesSearchParamsSchema,
  NotesSemanticSearchParamsSchema,
  NoteUpdatedPayloadSchema,
} from '@/contexts/notes/schemas/messageSchemas';
import {
  LinkedInProfileMigrationParamsSchema,
  ProfileDataParamsSchema,
  ProfileSchemaMap,
  ProfileUpdatedPayloadSchema,
  ProfileUpdateParamsSchema,
} from '@/contexts/profiles/schemas/messageSchemas';
import {
  WebsiteContentGenerationParamsSchema,
  WebsiteDeployedPayloadSchema,
  WebsiteGeneratedPayloadSchema,
  WebsiteIdentityUpdateParamsSchema,
  WebsiteSchemaMap,
  WebsiteStatusParamsSchema,
} from '@/contexts/website/schemas/messageSchemas';

import type { 
  DataRequestMessage, 
  NotificationMessage, 
} from './messageTypes';

// Re-export all schemas for convenience
export {
  // Conversation context schemas
  ConversationHistoryParamsSchema,
  ConversationStartedPayloadSchema,
  ConversationClearedPayloadSchema,
  ConversationTurnAddedPayloadSchema,
  CreateConversationParamsSchema,
  CreateConversationTurnParamsSchema,
  
  // External Sources context schemas
  ExternalSourceSearchRequestSchema,
  ExternalSourceStatusRequestSchema,
  ExternalSourceSearchNotificationSchema,
  ExternalSourceAvailabilityNotificationSchema,
  
  // Notes context schemas
  NoteByIdParamsSchema,
  NotesSearchParamsSchema,
  NotesSemanticSearchParamsSchema,
  NoteCreatedPayloadSchema,
  NoteUpdatedPayloadSchema,
  NoteDeletedPayloadSchema,
  
  // Profiles context schemas
  ProfileDataParamsSchema,
  ProfileUpdatedPayloadSchema,
  ProfileUpdateParamsSchema,
  LinkedInProfileMigrationParamsSchema,
  
  // Website context schemas
  WebsiteStatusParamsSchema,
  WebsiteGeneratedPayloadSchema,
  WebsiteDeployedPayloadSchema,
  WebsiteIdentityUpdateParamsSchema,
  WebsiteContentGenerationParamsSchema,
};

// Re-export all types
export type {
  // Conversation context types
  ConversationHistoryParams,
  ConversationStartedPayload,
  ConversationClearedPayload,
  ConversationTurnAddedPayload,
  CreateConversationTurnParams,
  CreateConversationParams,
} from '@/contexts/conversations/schemas/messageSchemas';

export type {
  // External Sources context types
  ExternalSourceSearchParams,
  ExternalSourceStatusParams,
  ExternalSourceSearchNotificationPayload,
  ExternalSourceAvailabilityNotificationPayload,
} from '@/contexts/externalSources/schemas/messageSchemas';

export type {
  // Notes context types
  NoteByIdParams,
  NotesSearchParams,
  NotesSemanticSearchParams,
  NoteCreatedPayload,
  NoteUpdatedPayload,
  NoteDeletedPayload,
} from '@/contexts/notes/schemas/messageSchemas';

export type {
  // Profiles context types
  ProfileDataParams,
  ProfileUpdatedPayload,
  ProfileUpdateParams,
  LinkedInProfileMigrationParams,
} from '@/contexts/profiles/schemas/messageSchemas';

export type {
  // Website context types
  WebsiteStatusParams,
  WebsiteGeneratedPayload,
  WebsiteDeployedPayload,
  WebsiteIdentityUpdateParams,
  WebsiteContentGenerationParams,
} from '@/contexts/website/schemas/messageSchemas';

/**
 * Registry mapping message types to their parameter schemas
 * This provides a way to look up the appropriate schema for a given message type
 */
export const MessageSchemaRegistry = {
  // Conversation context schemas
  ...ConversationSchemaMap,
  
  // External Sources context schemas
  ...ExternalSourceSchemaMap,
  
  // Notes context schemas
  ...NoteSchemaMap,
  
  // Profiles context schemas
  ...ProfileSchemaMap,
  
  // Website context schemas
  ...WebsiteSchemaMap,
} as const;

/**
 * Type guard to check if a message is a DataRequestMessage
 * 
 * @param message The message to check
 * @returns Whether the message is a DataRequestMessage
 */
export function isDataRequestMessage(
  message: unknown,
): message is DataRequestMessage {
  if (!message || typeof message !== 'object') {
    return false;
  }
  
  const msg = message as Record<string, unknown>;
  return (
    msg['category'] === 'request' &&
    'dataType' in msg
  );
}

/**
 * Type guard to check if a message is a NotificationMessage
 * 
 * @param message The message to check
 * @returns Whether the message is a NotificationMessage
 */
export function isNotificationMessage(
  message: unknown,
): message is NotificationMessage {
  if (!message || typeof message !== 'object') {
    return false;
  }
  
  const msg = message as Record<string, unknown>;
  return (
    msg['category'] === 'notification' &&
    'notificationType' in msg
  );
}

/**
 * Check if a schema exists for a specific request type
 * 
 * @param dataType The data request type to check
 * @returns Whether a schema exists for the request type
 */
export function hasSchemaForRequestType(dataType: string): boolean {
  return dataType in MessageSchemaRegistry;
}

/**
 * Check if a schema exists for a specific notification type
 * 
 * @param notificationType The notification type to check
 * @returns Whether a schema exists for the notification type
 */
export function hasSchemaForNotificationType(notificationType: string): boolean {
  return notificationType in MessageSchemaRegistry;
}