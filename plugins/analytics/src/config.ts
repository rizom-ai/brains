import { z } from "@brains/utils";

/**
 * PostHog EU Cloud configuration for website analytics
 */
export const posthogConfigSchema = z.object({
  enabled: z.boolean().default(false),
  projectId: z.string().describe("PostHog project ID"),
  apiKey: z.string().describe("PostHog personal API key"),
});

/**
 * Social media analytics configuration
 * Uses messaging to social-media plugin for platform-specific API calls
 */
export const socialAnalyticsConfigSchema = z.object({
  enabled: z.boolean().default(false),
});

/**
 * Analytics plugin configuration schema
 */
export const analyticsConfigSchema = z.object({
  posthog: posthogConfigSchema.optional(),
  social: socialAnalyticsConfigSchema.optional(),
});

export type PosthogConfig = z.infer<typeof posthogConfigSchema>;
export type SocialAnalyticsConfig = z.infer<typeof socialAnalyticsConfigSchema>;
export type AnalyticsConfig = z.infer<typeof analyticsConfigSchema>;
