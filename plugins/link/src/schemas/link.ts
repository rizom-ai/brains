import { z } from "@brains/utils";

/**
 * Source reference for links (where the link was captured from)
 * - ref: URI-style reference for backlinking (e.g., "matrix:!roomid:server", "mcp:stdio", "cli:local")
 * - label: Human-readable display name (e.g., "#engineering", "MCP", "CLI")
 */
export const linkSourceSchema = z.object({
  ref: z.string(),
  label: z.string(),
});

/**
 * Link status
 * - pending: extraction in progress or failed, awaiting completion
 * - draft: extraction complete, awaiting review/publication
 * - published: user explicitly published the link
 */
export const linkStatusSchema = z.enum(["pending", "draft", "published"]);

/**
 * Link frontmatter schema (stored in content as YAML frontmatter)
 * Contains all structured data - the body is just the summary text
 */
export const linkFrontmatterSchema = z.object({
  status: linkStatusSchema,
  title: z.string(),
  url: z.string().url(),
  description: z.string().optional(),
  keywords: z.array(z.string()),
  domain: z.string(),
  capturedAt: z.string().datetime(),
  source: linkSourceSchema,
});

/**
 * Link metadata schema - derived from frontmatter
 * Only includes fields needed for fast DB queries/filtering
 * Using .pick() ensures metadata stays in sync with frontmatter
 */
export const linkMetadataSchema = linkFrontmatterSchema.pick({
  title: true,
  status: true,
});

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
export type LinkFrontmatter = z.infer<typeof linkFrontmatterSchema>;
export type LinkEntity = z.infer<typeof linkSchema>;
export type LinkConfig = z.infer<typeof linkConfigSchema>;
export type LinkMetadata = z.infer<typeof linkMetadataSchema>;
