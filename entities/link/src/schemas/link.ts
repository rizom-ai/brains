import { z } from "@brains/utils/zod";
import { baseEntityParserSchema } from "@brains/plugins";

/**
 * Source reference for links (where the link was captured from)
 * - ref: URI-style reference for backlinking (e.g., "matrix:!roomid:server", "mcp:stdio", "cli:local")
 * - label: Human-readable display name (e.g., "#engineering", "MCP", "CLI")
 */
type LinkSourceSchema = z.ZodObject<{
  ref: z.ZodString;
  label: z.ZodString;
}>;

export const linkSourceSchema: LinkSourceSchema = z.object({
  ref: z.string(),
  label: z.string(),
});

export type LinkSource = z.output<typeof linkSourceSchema>;

/**
 * Link status
 * - pending: extraction in progress or failed, awaiting completion
 * - draft: extraction complete, awaiting review/publication
 * - published: user explicitly published the link
 */
export const linkStatusSchema: z.ZodEnum<{
  pending: "pending";
  draft: "draft";
  published: "published";
}> = z.enum(["pending", "draft", "published"]);

export type LinkStatus = z.output<typeof linkStatusSchema>;

/**
 * Link frontmatter schema (stored in content as YAML frontmatter)
 * Contains all structured data - the body is just the summary text
 */
type LinkFrontmatterSchema = z.ZodObject<{
  status: typeof linkStatusSchema;
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

export type LinkFrontmatter = z.output<typeof linkFrontmatterSchema>;

/**
 * Link metadata schema - derived from frontmatter
 * Only includes fields needed for fast DB queries/filtering
 * Using .pick() ensures metadata stays in sync with frontmatter
 */
type LinkMetadataSchema = z.ZodObject<{
  title: z.ZodString;
  status: typeof linkStatusSchema;
  capturedAt: z.ZodString;
}>;

export const linkMetadataSchema: LinkMetadataSchema =
  linkFrontmatterSchema.pick({
    title: true,
    status: true,
    capturedAt: true,
  });

export type LinkMetadata = z.output<typeof linkMetadataSchema>;

/**
 * Link entity schema
 */
export const linkSchema: ReturnType<
  typeof baseEntityParserSchema.extend<{
    entityType: z.ZodLiteral<"link">;
    metadata: LinkMetadataSchema;
  }>
> = baseEntityParserSchema.extend({
  entityType: z.literal("link"),
  metadata: linkMetadataSchema,
});

export type LinkEntity = z.output<typeof linkSchema>;

/**
 * Read the status out of an entity's metadata bag.
 *
 * `entityService.getEntity` hands back a `BaseEntity`, whose metadata is
 * `Record<string, unknown>` — so the stored value has to be validated here
 * rather than asserted. LinkStatus is a closed union, and an entity carrying
 * anything else is corrupt; failing loudly beats treating it as a valid state.
 */
export function readLinkStatus(metadata: Record<string, unknown>): LinkStatus {
  return linkStatusSchema.parse(metadata["status"]);
}
