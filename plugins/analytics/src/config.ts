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
 * LinkedIn analytics configuration
 * Shares access token with social-media plugin via LINKEDIN_ACCESS_TOKEN env var
 */
export const linkedinAnalyticsConfigSchema = z.object({
  accessToken: z
    .string()
    .describe("LinkedIn OAuth2 access token (shared with social-media plugin)"),
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
  socialMetrics: z
    .string()
    .default("0 */6 * * *")
    .describe(
      "Cron schedule for social metrics collection (default: every 6 hours)",
    ),
});

/**
 * Analytics plugin configuration schema
 */
export const analyticsConfigSchema = z.object({
  cloudflare: cloudflareConfigSchema.optional(),
  linkedin: linkedinAnalyticsConfigSchema.optional(),
  cron: cronConfigSchema.optional(),
});

export type CloudflareConfig = z.infer<typeof cloudflareConfigSchema>;
export type LinkedinAnalyticsConfig = z.infer<
  typeof linkedinAnalyticsConfigSchema
>;
export type CronConfig = z.infer<typeof cronConfigSchema>;
export type AnalyticsConfig = z.infer<typeof analyticsConfigSchema>;
