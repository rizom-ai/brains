import { z } from "@brains/utils/zod";
import { baseEntityParserSchema } from "@brains/plugins";

/**
 * Source reference for links (where the link was captured from)
 * - ref: URI-style reference for backlinking (e.g., "matrix:!roomid:server", "mcp:stdio", "cli:local")
 * - label: Human-readable display name (e.g., "#engineering", "MCP", "CLI")
 */
export interface LinkSource {
  ref: string;
  label: string;
}

type LinkSourceSchema = z.ZodObject<{
  ref: z.ZodString;
  label: z.ZodString;
}>;

export const linkSourceSchema: LinkSourceSchema = z.object({
  ref: z.string(),
  label: z.string(),
});

/**
 * Link status
 * - pending: extraction in progress or failed, awaiting completion
 * - draft: extraction complete, awaiting review/publication
 * - published: user explicitly published the link
 */
export type LinkStatus = "pending" | "draft" | "published";

export const linkStatusSchema: z.ZodType<LinkStatus, LinkStatus> = z.enum([
  "pending",
  "draft",
  "published",
]);

const linkStatusParserSchema: z.ZodType<LinkStatus, LinkStatus> = z.enum([
  "pending",
  "draft",
  "published",
]);

/**
 * Link frontmatter schema (stored in content as YAML frontmatter)
 * Contains all structured data - the body is just the summary text
 */
export interface LinkFrontmatter {
  [key: string]: unknown;
  status: LinkStatus;
  title: string;
  url: string;
  description?: string | undefined;
  domain: string;
  capturedAt: string;
  source: LinkSource;
}

type LinkFrontmatterSchema = z.ZodObject<{
  status: z.ZodType<LinkStatus, LinkStatus>;
  title: z.ZodString;
  url: z.ZodString;
  description: z.ZodOptional<z.ZodString>;
  domain: z.ZodString;
  capturedAt: z.ZodString;
  source: LinkSourceSchema;
}>;

export const linkFrontmatterSchema: LinkFrontmatterSchema = z.object({
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
export interface LinkMetadata {
  [key: string]: unknown;
  title: string;
  status: LinkStatus;
}

type LinkMetadataSchema = z.ZodObject<{
  title: z.ZodString;
  status: z.ZodType<LinkStatus, LinkStatus>;
}>;

export const linkMetadataSchema: LinkMetadataSchema =
  linkFrontmatterSchema.pick({
    title: true,
    status: true,
  });

/**
 * Link entity schema
 */
const linkEntityMetadataParserSchema: LinkMetadataSchema = z.object({
  title: z.string(),
  status: linkStatusParserSchema,
});

export const linkSchema: ReturnType<
  typeof baseEntityParserSchema.extend<{
    entityType: z.ZodLiteral<"link">;
    metadata: LinkMetadataSchema;
  }>
> = baseEntityParserSchema.extend({
  entityType: z.literal("link"),
  metadata: linkEntityMetadataParserSchema,
});

export type LinkEntity = z.output<typeof linkSchema>;
