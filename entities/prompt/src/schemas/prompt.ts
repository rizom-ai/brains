import { z } from "@brains/utils";
import { baseEntitySchema } from "@brains/plugins";

/**
 * Prompt frontmatter schema
 * target maps to a template name (e.g. "blog:generation", "link:extraction")
 */
export const promptFrontmatterSchema = z.object({
  title: z.string(),
  target: z.string(),
});

export type PromptFrontmatter = z.infer<typeof promptFrontmatterSchema>;

/**
 * Prompt metadata schema — derived from frontmatter
 */
export const promptMetadataSchema = z.object({
  title: z.string(),
  target: z.string(),
  slug: z.string().optional(),
});

export type PromptMetadata = z.infer<typeof promptMetadataSchema>;

/**
 * Prompt entity schema
 */
export const promptSchema = baseEntitySchema.extend({
  entityType: z.literal("prompt"),
  metadata: promptMetadataSchema,
});

export type Prompt = z.infer<typeof promptSchema>;
