import { z } from "@brains/utils/zod";

type CloudflareConfigSchema = z.ZodObject<{
  accountId: z.ZodString;
  apiToken: z.ZodString;
  siteTag: z.ZodString;
}>;

/**
 * Cloudflare Web Analytics configuration
 * Privacy-focused, no cookies, GDPR compliant
 */
export const cloudflareConfigSchema: CloudflareConfigSchema = z.object({
  accountId: z.string().describe("Cloudflare account ID"),
  apiToken: z
    .string()
    .describe("Cloudflare API token with Analytics:Read permission"),
  siteTag: z.string().describe("Cloudflare Web Analytics site tag"),
});

export type CloudflareConfig = z.output<typeof cloudflareConfigSchema>;
export type CloudflareConfigInput = z.input<typeof cloudflareConfigSchema>;

type AnalyticsConfigSchema = z.ZodObject<{
  cloudflare: z.ZodOptional<CloudflareConfigSchema>;
}>;

/**
 * Analytics plugin configuration schema
 */
export const analyticsConfigSchema: AnalyticsConfigSchema = z.object({
  cloudflare: cloudflareConfigSchema.optional(),
});

export type AnalyticsConfig = z.output<typeof analyticsConfigSchema>;
export type AnalyticsConfigInput = z.input<typeof analyticsConfigSchema>;
