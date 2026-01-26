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
 * Cron schedule configuration
 */
export const cronConfigSchema = z.object({
  websiteMetrics: z
    .string()
    .default("0 2 * * *")
    .describe(
      "Cron schedule for website metrics collection (default: daily at 2 AM)",
    ),
});

/**
 * Analytics plugin configuration schema
 */
export const analyticsConfigSchema = z.object({
  cloudflare: cloudflareConfigSchema.optional(),
  cron: cronConfigSchema.optional(),
});

export type CloudflareConfig = z.infer<typeof cloudflareConfigSchema>;
export type CronConfig = z.infer<typeof cronConfigSchema>;
export type AnalyticsConfig = z.infer<typeof analyticsConfigSchema>;
