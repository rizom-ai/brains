import { z } from "@brains/utils";

/**
 * Cloudflare Web Analytics configuration
 * Privacy-focused, no cookies, GDPR compliant
 */
export const cloudflareConfigSchema = z.object({
  accountId: z.string().describe("Cloudflare account ID"),
  apiToken: z
    .string()
    .describe("Cloudflare API token with Analytics:Read permission"),
  siteTag: z.string().describe("Cloudflare Web Analytics site tag"),
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
  cloudflare: cloudflareConfigSchema.optional(),
  social: socialAnalyticsConfigSchema.optional(),
});

export type CloudflareConfig = z.infer<typeof cloudflareConfigSchema>;
export type SocialAnalyticsConfig = z.infer<typeof socialAnalyticsConfigSchema>;
export type AnalyticsConfig = z.infer<typeof analyticsConfigSchema>;
