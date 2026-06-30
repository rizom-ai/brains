import { baseEntityParserSchema } from "@brains/plugins";
import { z } from "@brains/utils/zod-v4";

/**
 * Prompt frontmatter schema
 * target maps to a template name (e.g. "blog:generation", "link:extraction")
 */
export const promptFrontmatterSchema = z.object({
  title: z.string(),
  target: z.string(),
});

export type PromptFrontmatter = z.output<typeof promptFrontmatterSchema>;

/**
 * Prompt metadata schema — derived from frontmatter
 */
export const promptMetadataSchema = z.object({
  title: z.string(),
  target: z.string(),
  slug: z.string().optional(),
});

export type PromptMetadata = z.output<typeof promptMetadataSchema>;

/**
 * Prompt entity schema
 */
export const promptSchema = baseEntityParserSchema.extend({
  entityType: z.literal("prompt"),
  metadata: promptMetadataSchema,
});

export type Prompt = z.output<typeof promptSchema>;
