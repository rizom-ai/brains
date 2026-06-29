import { z } from "@brains/utils/zod-v4";
import { z as z4 } from "@brains/utils/zod-v4";
import { baseEntityParserSchema } from "@brains/plugins";

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

const linkStatusParserSchema = z4.enum(["pending", "draft", "published"]);

/**
 * Link frontmatter schema (stored in content as YAML frontmatter)
 * Contains all structured data - the body is just the summary text
 */
export const linkFrontmatterSchema = z.object({
  status: linkStatusSchema,
  title: z.string(),
  url: z.string().url(),
  description: z.string().optional(),
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
const linkEntityMetadataParserSchema = z4.object({
  title: z4.string(),
  status: linkStatusParserSchema,
});

export const linkSchema = baseEntityParserSchema.extend({
  entityType: z4.literal("link"),
  metadata: linkEntityMetadataParserSchema,
});

export type LinkSource = z.output<typeof linkSourceSchema>;
export type LinkStatus = z.output<typeof linkStatusSchema>;
export type LinkFrontmatter = z.output<typeof linkFrontmatterSchema>;
export type LinkEntity = z4.output<typeof linkSchema>;
export type LinkMetadata = z.output<typeof linkMetadataSchema>;
