/**
 * Schema definitions for protocol message formats
 * 
 * This module exports schema definitions used in the protocol layer
 * for validation and typing.
 * 
 * PUBLIC API: These exports are intended for use by upstream consumers
 */

// Export standard response schema
export type { StandardResponse } from './standardResponseSchema';
export { StandardResponseSchema, generateStandardSystemPrompt } from './standardResponseSchema';

// Export conversation schemas
export type {
  ConversationTurn,
  ConversationSummary,
  Conversation,
  ConversationOptions,
  MemoryTier,
} from './conversationSchemas';
export {
  ConversationTurnSchema,
  ConversationSummarySchema,
  ConversationSchema,
  ConversationOptionsSchema,
  MemoryTierEnum,
} from './conversationSchemas';

// Export external source schemas
export type {
  ExternalSourceResult,
  ExternalSearchOptions,
  ExternalSourceMetadata,
  SourceAvailability,
  ExternalSourceSearchRequest,
  ExternalSourceSearchResponse,
  ExternalSourceSearchNotification,
  ExternalSourceAvailabilityNotification,
  ExternalSourceStatusRequest,
  ExternalSourceStatusResponse,
  ExternalSourceNotification,
} from './externalSourceSchemas';
export {
  ExternalSourceResultSchema,
  ExternalSearchOptionsSchema,
  ExternalSourceMetadataSchema,
  SourceAvailabilitySchema,
  ExternalSourceSearchRequestSchema,
  ExternalSourceSearchResponseSchema,
  ExternalSourceSearchNotificationSchema,
  ExternalSourceAvailabilityNotificationSchema,
  ExternalSourceStatusRequestSchema,
  ExternalSourceStatusResponseSchema,
  ExternalSourceNotificationSchema,
} from './externalSourceSchemas';

// Export conversation context configuration
export type { ConversationContextConfig } from './conversationContextConfig';