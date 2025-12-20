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
 * Link status
 * - pending: extraction in progress or failed, awaiting completion
 * - draft: extraction complete, awaiting review/publication
 * - published: user explicitly published the link
 * - failed: link is permanently broken or user declined to provide info
 */
export const linkStatusSchema = z.enum([
  "pending",
  "draft",
  "published",
  "failed",
]);

/**
 * Link body schema for structured content storage
 */
export const linkBodySchema = z.object({
  url: z.string().url(),
  title: z.string().optional(), // Page title - optional if extraction failed
  description: z.string().optional(), // One-sentence description - optional if extraction failed
  summary: z.string().optional(), // Full summary - optional if extraction failed
  keywords: z.array(z.string()), // Can be empty array if extraction failed
  domain: z.string(),
  capturedAt: z.string().datetime(),
  source: linkSourceSchema,
  status: linkStatusSchema, // "draft" when extracted, "published" when user publishes
  extractionError: z.string().optional(), // Error message if extraction failed
});

/**
 * Link metadata schema for filtering
 */
export const linkMetadataSchema = z.object({
  status: linkStatusSchema.optional(),
});

export type LinkMetadata = z.infer<typeof linkMetadataSchema>;

/**
 * Link entity schema
 */
export const linkSchema = z.object({
  id: z.string(),
  entityType: z.literal("link"),
  content: z.string(),
  contentHash: z.string(), // SHA256 hash of content for change detection
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
  jinaApiKey: z
    .string()
    .optional()
    .describe(
      "Jina Reader API key for higher rate limits (500 RPM vs 20 RPM without key)",
    ),
});

export type LinkSource = z.infer<typeof linkSourceSchema>;
export type LinkStatus = z.infer<typeof linkStatusSchema>;
export type LinkBody = z.infer<typeof linkBodySchema>;
export type LinkEntity = z.infer<typeof linkSchema>;
export type LinkConfig = z.infer<typeof linkConfigSchema>;
