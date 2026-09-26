/**
 * Prompt entity package.
 *
 * Prompts are AI instructions stored as markdown, editable via CMS or a
 * text editor. Schema and markdown codec only — no tools, no generation
 * handler, no templates.
 *
 * Authored against the public declarative surface (`@brains/sdk/entities`),
 * which is what `@rizom/brain/entities` re-exports. This package is the
 * Milestone A proof that an official entity package can be written
 * without reaching for shell internals.
 */

import {
  defineEntity,
  defineEntityPackage,
  z,
  type EntityDefinition,
  type EntityOf,
  type EntityPackageDefinition,
} from "@brains/sdk/entities";

/**
 * Derive a prompt's slug from its target, e.g. "blog:generation" →
 * "blog-generation". Inlined rather than imported from `@brains/utils`,
 * which is not part of the authoring contract available to published
 * packages.
 */
export function promptSlug(target: string): string {
  return target
    .replace(/:/gu, "-")
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/gu, "")
    .replace(/[\s_-]+/gu, "-")
    .replace(/^-+|-+$/gu, "");
}

/**
 * Written out rather than inferred: this package compiles with
 * `isolatedDeclarations`, so every exported declaration needs an explicit
 * type and the schema type must be nameable.
 */
type PromptMetadataSchema = z.ZodObject<{
  title: z.ZodString;
  /** Template this prompt overrides, e.g. "blog:generation". */
  target: z.ZodString;
  slug: z.ZodOptional<z.ZodString>;
}>;

const promptMetadata: PromptMetadataSchema = z.object({
  title: z.string(),
  target: z.string(),
  slug: z.string().optional(),
});

export const prompt: EntityDefinition<"prompt", PromptMetadataSchema> =
  defineEntity({
    type: "prompt",
    purpose: "A reusable prompt or instruction template.",
    metadata: promptMetadata,
    markdown: {
      decode: ({ content, frontmatter }) => {
        const title = z.string().parse(frontmatter["title"]);
        const target = z.string().parse(frontmatter["target"]);
        return {
          content,
          metadata: { title, target, slug: promptSlug(target) },
        };
      },
      // slug is derived on decode, so it is not written back to disk.
      encode: ({ content, metadata }) => ({
        content,
        frontmatter: { title: metadata.title, target: metadata.target },
      }),
    },
    // Prompts are system configuration, not user content: keep them out of
    // search embeddings and out of projection sourcing. Both default to true.
    config: {
      embeddable: false,
      projectionSource: false,
      projectionSourceRole: "excluded",
    },
  });

export type Prompt = EntityOf<typeof prompt>;

const promptPackage: EntityPackageDefinition<
  readonly [typeof prompt],
  readonly []
> = defineEntityPackage({
  id: "prompt",
  entities: [prompt],
});

export default promptPackage;
