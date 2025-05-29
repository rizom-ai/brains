/**
 * Website Context Message Schemas
 * 
 * This module defines Zod schemas for validating message parameters and payloads
 * specific to the Website context. These schemas ensure type safety and validation
 * for cross-context communication involving website operations.
 */

import { z } from 'zod';

import { DataRequestType, NotificationType } from '@/protocol/messaging/messageTypes';

/**
 * Schema for WEBSITE_STATUS request parameters
 * Used when requesting website generation status
 */
export const WebsiteStatusParamsSchema = z.object({
  /** Environment to check status for (preview or live) */
  environment: z.enum(['preview', 'live']).optional().default('preview'),
}).optional();

/**
 * Schema for WEBSITE_GENERATED notification payload
 * Used when notifying that a website was generated
 */
export const WebsiteGeneratedPayloadSchema = z.object({
  /** ID of the generated website */
  id: z.string().min(1, 'Website ID is required'),
  /** Timestamp of the generation */
  timestamp: z.date(),
  /** Optional type of generation */
  type: z.enum(['landing-page', 'build', 'preview']).optional(),
  /** URL of the preview (for preview types) */
  url: z.string().url().optional(),
  /** Path to built files (for build types) */
  path: z.string().optional(),
  /** Additional metadata about the generation */
  metadata: z.record(z.unknown()).optional(),
});

/**
 * Schema for WEBSITE_DEPLOYED notification payload
 * Used when notifying that a website was deployed
 */
export const WebsiteDeployedPayloadSchema = z.object({
  /** ID of the deployed website */
  id: z.string().min(1, 'Website ID is required'),
  /** URL of the deployed website */
  url: z.string().url(),
  /** Timestamp of the deployment */
  timestamp: z.date(),
  /** Type of deployment */
  type: z.string().optional(),
  /** Additional metadata about the deployment */
  metadata: z.record(z.unknown()).optional(),
});

/**
 * Schema for website identity tool parameters
 * Used when updating website identity
 */
export const WebsiteIdentityUpdateParamsSchema = z.object({
  /** Brand identity data */
  identity: z.object({
    name: z.string().min(1, 'Brand name is required'),
    tagline: z.string().optional(),
    description: z.string().optional(),
    industry: z.string().optional(),
    targetAudience: z.array(z.string()).optional(),
    values: z.array(z.string()).optional(),
    voiceTone: z.string().optional(),
    colors: z.record(z.string()).optional(),
    logo: z.string().optional(),
  }),
});

/**
 * Schema for generating website content tool parameters
 * Used when generating website section content
 */
export const WebsiteContentGenerationParamsSchema = z.object({
  /** Section to generate content for */
  section: z.string().min(1, 'Section name is required'),
  /** Optional content guidelines */
  guidelines: z.string().optional(),
  /** Whether to use the brand identity */
  useIdentity: z.boolean().optional().default(true),
});

/**
 * Map of message types to their schemas for this context
 * This allows for easy lookup of schemas by message type
 * and helps ensure schema coverage for all message types
 */
export const WebsiteSchemaMap = {
  // Request parameter schemas
  [DataRequestType.WEBSITE_STATUS]: WebsiteStatusParamsSchema,
  
  // Notification payload schemas
  [NotificationType.WEBSITE_GENERATED]: WebsiteGeneratedPayloadSchema,
  [NotificationType.WEBSITE_DEPLOYED]: WebsiteDeployedPayloadSchema,
  
  // Tool parameter schemas
  'website.updateIdentity': WebsiteIdentityUpdateParamsSchema,
  'website.generateContent': WebsiteContentGenerationParamsSchema,
} as const;

// Export derived types for use in type-safe code
export type WebsiteStatusParams = z.infer<typeof WebsiteStatusParamsSchema>;
export type WebsiteGeneratedPayload = z.infer<typeof WebsiteGeneratedPayloadSchema>;
export type WebsiteDeployedPayload = z.infer<typeof WebsiteDeployedPayloadSchema>;
export type WebsiteIdentityUpdateParams = z.infer<typeof WebsiteIdentityUpdateParamsSchema>;
export type WebsiteContentGenerationParams = z.infer<typeof WebsiteContentGenerationParamsSchema>;