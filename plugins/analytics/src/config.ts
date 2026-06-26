import { z } from "@brains/utils/zod-v4";

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
 * Analytics plugin configuration schema
 */
export const analyticsConfigSchema = z.object({
  cloudflare: cloudflareConfigSchema.optional(),
});

export type CloudflareConfig = z.output<typeof cloudflareConfigSchema>;
export type AnalyticsConfig = z.output<typeof analyticsConfigSchema>;
export type AnalyticsConfigInput = z.input<typeof analyticsConfigSchema>;
