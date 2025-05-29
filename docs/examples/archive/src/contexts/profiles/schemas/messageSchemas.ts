/**
 * Profiles Context Message Schemas
 * 
 * This module defines Zod schemas for validating message parameters and payloads
 * specific to the Profiles context. These schemas ensure type safety and validation
 * for cross-context communication involving profiles.
 */

import { z } from 'zod';

import { linkedInInsertProfileSchema } from '@/models/linkedInProfile';
import { profileSchema } from '@/models/profile';
import { DataRequestType, NotificationType } from '@/protocol/messaging/messageTypes';

/**
 * Schema for PROFILE_DATA request parameters
 * Used when requesting profile data
 * No specific parameters needed, as this retrieves the current profile
 */
export const ProfileDataParamsSchema = z.object({}).optional();

/**
 * Schema for PROFILE_UPDATED notification payload
 * Used when notifying of a profile update
 */
export const ProfileUpdatedPayloadSchema = z.object({
  /** ID of the updated profile */
  profileId: z.string().min(1, 'Profile ID is required'),
  /** Fields that were updated */
  updatedFields: z.array(z.string()).optional(),
});

/**
 * Schema for profile update tool parameters
 * Uses the existing profile schema from the models
 */
export const ProfileUpdateParamsSchema = z.object({
  profile: profileSchema,
});

/**
 * Schema for LinkedIn profile migration tool parameters
 * Uses the existing LinkedIn profile schema from the models
 */
export const LinkedInProfileMigrationParamsSchema = z.object({
  linkedInProfile: linkedInInsertProfileSchema,
});

/**
 * Map of message types to their schemas for this context
 * This allows for easy lookup of schemas by message type
 * and helps ensure schema coverage for all message types
 */
export const ProfileSchemaMap = {
  // Request parameter schemas
  [DataRequestType.PROFILE_DATA]: ProfileDataParamsSchema,
  
  // Notification payload schemas
  [NotificationType.PROFILE_UPDATED]: ProfileUpdatedPayloadSchema,
  
  // Tool parameter schemas - these use special keys that match the tool IDs
  'profile.update': ProfileUpdateParamsSchema,
  'profile.migrateLinkedIn': LinkedInProfileMigrationParamsSchema,
} as const;

// Export derived types for use in type-safe code
export type ProfileDataParams = z.infer<typeof ProfileDataParamsSchema>;
export type ProfileUpdatedPayload = z.infer<typeof ProfileUpdatedPayloadSchema>;
export type ProfileUpdateParams = z.infer<typeof ProfileUpdateParamsSchema>;
export type LinkedInProfileMigrationParams = z.infer<typeof LinkedInProfileMigrationParamsSchema>;