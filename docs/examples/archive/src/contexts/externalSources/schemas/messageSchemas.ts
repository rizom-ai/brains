/**
 * Message Schemas for External Source Context
 * 
 * This file defines the schema for messages used by the external source context,
 * including request parameters and notification payloads.
 */

import type { z } from 'zod';

import { DataRequestType, NotificationType } from '@/protocol/messaging';
import {
  type ExternalSourceAvailabilityNotification,
  ExternalSourceAvailabilityNotificationSchema,
  type ExternalSourceResult,
  ExternalSourceResultSchema,
  type ExternalSourceSearchNotification,
  ExternalSourceSearchNotificationSchema,
  type ExternalSourceSearchRequest,
  ExternalSourceSearchRequestSchema,
  type ExternalSourceSearchResponse,
  ExternalSourceSearchResponseSchema,
  type ExternalSourceStatusRequest,
  ExternalSourceStatusRequestSchema,
  type ExternalSourceStatusResponse,
  ExternalSourceStatusResponseSchema,
} from '@/protocol/schemas';

/**
 * Schema map for external source context messages
 * Maps message types to their schemas for validation
 */
export const ExternalSourceSchemaMap = {
  // Request schemas
  [DataRequestType.EXTERNAL_SOURCES]: ExternalSourceSearchRequestSchema,
  'externalSources.status': ExternalSourceStatusRequestSchema,
  
  // Notification schemas
  [NotificationType.EXTERNAL_SOURCES_STATUS]: ExternalSourceSearchNotificationSchema,
  [NotificationType.EXTERNAL_SOURCES_AVAILABILITY]: ExternalSourceAvailabilityNotificationSchema,
  [NotificationType.EXTERNAL_SOURCES_SEARCH]: ExternalSourceSearchNotificationSchema,
} as const;

// Export schemas for use in validation
export {
  ExternalSourceResultSchema,
  ExternalSourceSearchRequestSchema,
  ExternalSourceSearchResponseSchema,
  ExternalSourceStatusRequestSchema,
  ExternalSourceStatusResponseSchema,
  ExternalSourceSearchNotificationSchema,
  ExternalSourceAvailabilityNotificationSchema,
};

// Export types for message parameters and payloads
export type {
  ExternalSourceResult,
  ExternalSourceSearchRequest,
  ExternalSourceSearchResponse,
  ExternalSourceStatusRequest,
  ExternalSourceStatusResponse,
  ExternalSourceSearchNotification,
  ExternalSourceAvailabilityNotification,
};

// Create specific param and payload type aliases for clarity
export type ExternalSourceSearchParams = z.infer<typeof ExternalSourceSearchRequestSchema>;
export type ExternalSourceStatusParams = z.infer<typeof ExternalSourceStatusRequestSchema>;
export type ExternalSourceSearchNotificationPayload = z.infer<typeof ExternalSourceSearchNotificationSchema>;
export type ExternalSourceAvailabilityNotificationPayload = z.infer<typeof ExternalSourceAvailabilityNotificationSchema>;