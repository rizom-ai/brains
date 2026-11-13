import { withFrontmatterSchema } from "@brains/sdk/internal/entity-runtime";
import { defineEntity, type EntityDefinition } from "@brains/sdk/entities";
import { getTemplates } from "./lib/register-templates";
import { guideMetadataSchema } from "./schemas/guide";
import { guideFrontmatterSchema } from "./schemas/guide-frontmatter";

const GUIDE_INSTRUCTIONS = [
  'Guides (entityType "guide") walk one kind of user through moving into a brain: a writer, researcher, consultant, team, or someone running their own brain.',
  "A question from someone who describes themselves, their material or how they work, and asks where to start, how to bring their material in, how to run a brain of their own, such as on their own server, or what a brain would do for them, is a guide question, even when it names no guide. A guide question is answered from its guide alone, without searching the docs: the guide links the docs for the details.",
  'For a guide question, first run system_list with entityType "guide", before asking the network or answering from general knowledge: each guide\'s metadata says who it is for (persona, for) and what material it moves in. Read the guide that fits the person with system_get, and answer from its stages.',
  'Name the guide you answer from by its title, such as "Moving in as a writer", so the reply links to it.',
].join("\n");

/** The fields a guide's file states: every field but those it leaves unset. */
export function statedGuideFields(
  metadata: Readonly<Record<string, unknown>>,
): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(metadata).filter(([, value]) => value !== null),
  );
}

/**
 * A moving-in guide. Its frontmatter is its metadata, every field of it,
 * since the index card shows them all; a field the file leaves unset reads
 * as null and is written back unset, as the class wrote it. Its frontmatter
 * schema is the class's, whose unset fields default to null, for Studio's
 * editor and the vault's templates.
 */
export const guide: EntityDefinition<"guide", typeof guideMetadataSchema> =
  withFrontmatterSchema(
    defineEntity({
      type: "guide",
      purpose:
        "A moving-in guide: how one kind of user brings their material and habits into a brain.",
      metadata: guideMetadataSchema,
      markdown: {
        decode: ({ content, frontmatter }) => ({
          // The class wrote its body from the line under its header.
          content: content.replace(/^\n+/u, ""),
          metadata: guideFrontmatterSchema.parse(frontmatter),
        }),
        encode: ({ content, metadata }) => ({
          content: content.replace(/^\n+/u, ""),
          frontmatter: statedGuideFields(metadata),
        }),
      },
      config: { projectionSourceRole: "primary" },
      instructions: GUIDE_INSTRUCTIONS,
      templates: getTemplates(),
    }),
    guideFrontmatterSchema,
  );
