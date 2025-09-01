import { z } from "@brains/utils";

/**
 * Link body schema for structured content storage
 */
export const linkBodySchema = z.object({
  url: z.string().url(),
  description: z.string(),
  summary: z.string(),
  content: z.string(),
  keywords: z.array(z.string()),
  domain: z.string(),
  capturedAt: z.string().datetime(),
});

/**
 * Link entity schema
 */
export const linkSchema = z.object({
  id: z.string(),
  entityType: z.literal("link"),
  content: z.string(),
  created: z.string().datetime(),
  updated: z.string().datetime(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

/**
 * Link plugin configuration schema
 */
export const linkConfigSchema = z.object({
  enableSummarization: z
    .boolean()
    .default(true)
    .describe("Generate AI summaries for captured links"),
  autoExtractKeywords: z
    .boolean()
    .default(true)
    .describe("Automatically extract keywords from content"),

  // Auto-capture configuration
  enableAutoCapture: z
    .boolean()
    .default(true)
    .describe("Enable automatic URL capture from conversations"),
  notifyOnCapture: z
    .boolean()
    .default(false)
    .describe("Send notification when links are auto-captured"),
  maxUrlsPerMessage: z
    .number()
    .min(1)
    .max(10)
    .default(3)
    .describe("Maximum number of URLs to capture from a single message"),
});

export type LinkBody = z.infer<typeof linkBodySchema>;
export type LinkEntity = z.infer<typeof linkSchema>;
export type LinkConfig = z.infer<typeof linkConfigSchema>;
