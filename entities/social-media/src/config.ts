import { z } from "@brains/sdk/entities";

/**
 * LinkedIn provider configuration
 */
type LinkedinConfigSchema = z.ZodObject<{
  accessToken: z.ZodOptional<z.ZodString>;
  refreshToken: z.ZodOptional<z.ZodString>;
  organizationId: z.ZodOptional<z.ZodString>;
  apiVersion: z.ZodOptional<z.ZodString>;
}>;

export const linkedinConfigSchema: LinkedinConfigSchema = z.object({
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
type SocialMediaConfigSchema = z.ZodObject<{
  linkedin: z.ZodOptional<LinkedinConfigSchema>;
}>;

// publishInterval, enabled, defaultPrompt, and maxRetries were also declared
// here. Nothing read any of them; credentials are the only configuration
// this package has.
export const socialMediaConfigSchema: SocialMediaConfigSchema = z.object({
  /** LinkedIn provider configuration */
  linkedin: linkedinConfigSchema.optional(),
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
