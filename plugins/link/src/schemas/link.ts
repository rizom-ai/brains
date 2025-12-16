import { z } from "@brains/utils";

/**
 * Source reference with metadata for links
 */
export const linkSourceSchema = z.object({
  slug: z.string(),
  title: z.string(),
  type: z.enum(["conversation", "manual"]),
});

/**
 * Link body schema for structured content storage
 */
export const linkBodySchema = z.object({
  url: z.string().url(),
  description: z.string(),
  summary: z.string(),
  keywords: z.array(z.string()),
  domain: z.string(),
  capturedAt: z.string().datetime(),
  source: linkSourceSchema,
});

/**
 * Link metadata schema - empty as links don't use metadata for filtering
 */
export const linkMetadataSchema = z.object({});

export type LinkMetadata = z.infer<typeof linkMetadataSchema>;

/**
 * Link entity schema
 */
export const linkSchema = z.object({
  id: z.string(),
  entityType: z.literal("link"),
  content: z.string(),
  created: z.string().datetime(),
  updated: z.string().datetime(),
  metadata: linkMetadataSchema,
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

export type LinkSource = z.infer<typeof linkSourceSchema>;
export type LinkBody = z.infer<typeof linkBodySchema>;
export type LinkEntity = z.infer<typeof linkSchema>;
export type LinkConfig = z.infer<typeof linkConfigSchema>;
