import { z } from "zod";

/**
 * LinkedIn provider configuration
 */
export const linkedinConfigSchema = z.object({
  accessToken: z.string().optional(),
  refreshToken: z.string().optional(),
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
});

/**
 * Social media plugin configuration type (output, with all defaults applied)
 */
export type SocialMediaConfig = z.infer<typeof socialMediaConfigSchema>;

/**
 * Social media plugin configuration input type (allows optional fields with defaults)
 */
export type SocialMediaConfigInput = Partial<SocialMediaConfig>;

/**
 * LinkedIn configuration type
 */
export type LinkedinConfig = z.infer<typeof linkedinConfigSchema>;
