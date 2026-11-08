import { z } from "@brains/sdk/entities";

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
  defaultHash: z.string().optional().meta({ studioWidget: "hidden" }),
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
 * Prompt metadata schema — derived from frontmatter. Studio edits a
 * prompt's metadata, so the derived slug and the default's hash are
 * hidden there, as they were absent from the frontmatter it edited.
 */
export const promptMetadataSchema: PromptMetadataSchema = z.object({
  title: z.string(),
  target: z.string(),
  slug: z.string().optional().meta({ studioWidget: "hidden" }),
  defaultHash: z.string().optional().meta({ studioWidget: "hidden" }),
});
