import {
  defineEntity,
  defineEntityPackage,
  type EntityDefinition,
  type EntityOf,
  type EntityPackageDefinition,
} from "@brains/sdk/entities";
import { slugify } from "@brains/utils/string-utils";
import {
  promptFrontmatterSchema,
  promptMetadataSchema,
} from "./schemas/prompt";

/**
 * Prompts are AI instructions stored as markdown files, editable via Studio
 * or a text editor: title, target and (for materialized defaults)
 * defaultHash in frontmatter, the prompt text as the body. No tools, no
 * generation, no templates.
 *
 * Prompts are system configuration, not user content: they stay out of
 * search embeddings and projection sourcing.
 */
export const prompt: EntityDefinition<"prompt", typeof promptMetadataSchema> =
  defineEntity({
    type: "prompt",
    classification: "system",
    purpose: "A reusable prompt or instruction template.",
    metadata: promptMetadataSchema,
    markdown: {
      decode: ({ content, frontmatter }) => {
        const parsed = promptFrontmatterSchema.parse(frontmatter);
        return {
          content,
          metadata: {
            title: parsed.title,
            target: parsed.target,
            slug: slugify(parsed.target.replace(/:/g, "-")),
            ...(parsed.defaultHash && { defaultHash: parsed.defaultHash }),
          },
        };
      },
      // The slug is derived on decode, so it is not written back to disk.
      encode: ({ content, metadata }) => ({
        content,
        frontmatter: {
          title: metadata.title,
          target: metadata.target,
          ...(metadata.defaultHash && { defaultHash: metadata.defaultHash }),
        },
      }),
    },
    config: {
      embeddable: false,
      projectionSource: false,
      projectionSourceRole: "excluded",
    },
  });

export type Prompt = EntityOf<typeof prompt>;

export const promptPackage: EntityPackageDefinition<
  readonly [typeof prompt],
  readonly []
> = defineEntityPackage({ id: "prompt", entities: [prompt] });
