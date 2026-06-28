import { baseEntityParserSchema } from "@brains/plugins";
import { z } from "@brains/utils/zod";
import { z as z4 } from "@brains/utils/zod-v4";

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
export const promptMetadataSchema = z4.object({
  title: z4.string(),
  target: z4.string(),
  slug: z4.string().optional(),
});

export type PromptMetadata = z4.output<typeof promptMetadataSchema>;

/**
 * Prompt entity schema
 */
export const promptSchema = baseEntityParserSchema.extend({
  entityType: z4.literal("prompt"),
  metadata: promptMetadataSchema,
});

export type Prompt = z4.output<typeof promptSchema>;
