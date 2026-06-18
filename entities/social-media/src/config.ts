import { z } from "@brains/utils";

/**
 * LinkedIn provider configuration
 */
export const linkedinConfigSchema = z.object({
  accessToken: z.string().optional(),
  refreshToken: z.string().optional(),
  /** LinkedIn organization ID for posting as an organization (requires w_organization_social scope) */
  organizationId: z.string().optional(),
  /** LinkedIn REST API marketing version (YYYYMM) for versioned /rest endpoints */
  apiVersion: z
    .string()
    .regex(/^\d{6}$/)
    .optional(),
});

/**
 * Social media plugin configuration schema
 */
export const socialMediaConfigSchema = z.object({
  /** LinkedIn provider configuration */
  linkedin: linkedinConfigSchema.optional(),
  /** Interval between publish checks in milliseconds (default: 1 hour) */
  publishInterval: z.number().default(3600000),
  /** Enable automatic publishing (default: true) */
  enabled: z.boolean().default(true),
  /** Default prompt for generating social posts */
  defaultPrompt: z
    .string()
    .default("Create an engaging social media post that drives engagement"),
  /** Maximum retry attempts before marking post as failed (default: 3) */
  maxRetries: z.number().default(3),
  /** Auto-generate social post when a blog post is published (default: false) */
  autoGenerateOnBlogPublish: z.boolean().default(false),
});

/**
 * Social media plugin configuration type (output, with all defaults applied)
 */
export type SocialMediaConfig = z.output<typeof socialMediaConfigSchema>;

/**
 * Social media plugin configuration input type (allows optional fields with defaults)
 */
export type SocialMediaConfigInput = z.input<typeof socialMediaConfigSchema>;

/**
 * LinkedIn configuration type
 */
export type LinkedinConfig = z.output<typeof linkedinConfigSchema>;
export type LinkedinConfigInput = z.input<typeof linkedinConfigSchema>;
