import { z } from "@brains/utils";

/**
 * Link body schema for structured content storage
 */
export const linkBodySchema = z.object({
  url: z.string().url(),
  description: z.string(),
  summary: z.string(),
  content: z.string(),
  tags: z.array(z.string()),
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
  autoTag: z
    .boolean()
    .default(true)
    .describe("Automatically generate tags from content"),
});

export type LinkBody = z.infer<typeof linkBodySchema>;
export type LinkEntity = z.infer<typeof linkSchema>;
export type LinkConfig = z.infer<typeof linkConfigSchema>;