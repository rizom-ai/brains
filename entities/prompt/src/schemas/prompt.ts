import { baseEntityParserSchema } from "@brains/plugins";
import { z } from "@brains/utils/zod";

export interface PromptFrontmatter {
  [key: string]: unknown;
  title: string;
  target: string;
  defaultHash?: string | undefined;
}

type PromptFrontmatterSchema = z.ZodObject<{
  title: z.ZodString;
  target: z.ZodString;
  defaultHash: z.ZodOptional<z.ZodString>;
}>;

/**
 * Prompt frontmatter schema
 * target maps to a template name (e.g. "blog:generation", "link:extraction")
 * defaultHash is the hash of the default body a materialized copy was written
 * from; while the body still hashes to it, the copy is refreshed when the
 * default changes.
 */
export const promptFrontmatterSchema: PromptFrontmatterSchema = z.object({
  title: z.string(),
  target: z.string(),
  defaultHash: z.string().optional(),
});

export interface PromptMetadata {
  [key: string]: unknown;
  title: string;
  target: string;
  slug?: string | undefined;
  defaultHash?: string | undefined;
}

type PromptMetadataSchema = z.ZodObject<{
  title: z.ZodString;
  target: z.ZodString;
  slug: z.ZodOptional<z.ZodString>;
  defaultHash: z.ZodOptional<z.ZodString>;
}>;

/**
 * Prompt metadata schema — derived from frontmatter
 */
export const promptMetadataSchema: PromptMetadataSchema = z.object({
  title: z.string(),
  target: z.string(),
  slug: z.string().optional(),
  defaultHash: z.string().optional(),
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
