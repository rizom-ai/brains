import { baseEntityParserSchema } from "@brains/plugins";
import { z } from "@brains/utils/zod-v4";

export interface PromptFrontmatter {
  [key: string]: unknown;
  title: string;
  target: string;
}

type PromptFrontmatterSchema = z.ZodObject<{
  title: z.ZodString;
  target: z.ZodString;
}>;

/**
 * Prompt frontmatter schema
 * target maps to a template name (e.g. "blog:generation", "link:extraction")
 */
export const promptFrontmatterSchema: PromptFrontmatterSchema = z.object({
  title: z.string(),
  target: z.string(),
});

export interface PromptMetadata {
  [key: string]: unknown;
  title: string;
  target: string;
  slug?: string | undefined;
}

type PromptMetadataSchema = z.ZodObject<{
  title: z.ZodString;
  target: z.ZodString;
  slug: z.ZodOptional<z.ZodString>;
}>;

/**
 * Prompt metadata schema — derived from frontmatter
 */
export const promptMetadataSchema: PromptMetadataSchema = z.object({
  title: z.string(),
  target: z.string(),
  slug: z.string().optional(),
});

/**
 * Prompt entity schema
 */
export const promptSchema: ReturnType<
  typeof baseEntityParserSchema.extend<{
    entityType: z.ZodLiteral<"prompt">;
    metadata: PromptMetadataSchema;
  }>
> = baseEntityParserSchema.extend({
  entityType: z.literal("prompt"),
  metadata: promptMetadataSchema,
});

export type Prompt = z.output<typeof promptSchema>;
