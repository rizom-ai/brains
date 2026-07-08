import { z } from "@brains/utils/zod";

/**
 * Cloudflare Web Analytics configuration
 * Privacy-focused, no cookies, GDPR compliant
 */
export interface CloudflareConfig {
  accountId: string;
  apiToken: string;
  siteTag: string;
}

export type CloudflareConfigInput = CloudflareConfig;

export const cloudflareConfigSchema: z.ZodType<
  CloudflareConfig,
  CloudflareConfigInput
> = z.object({
  accountId: z.string().describe("Cloudflare account ID"),
  apiToken: z
    .string()
    .describe("Cloudflare API token with Analytics:Read permission"),
  siteTag: z.string().describe("Cloudflare Web Analytics site tag"),
});

/**
 * Analytics plugin configuration schema
 */
export interface AnalyticsConfig {
  cloudflare?: CloudflareConfig | undefined;
}

export interface AnalyticsConfigInput {
  cloudflare?: CloudflareConfigInput | undefined;
}

export const analyticsConfigSchema: z.ZodType<
  AnalyticsConfig,
  AnalyticsConfigInput
> = z.object({
  cloudflare: cloudflareConfigSchema.optional(),
});
