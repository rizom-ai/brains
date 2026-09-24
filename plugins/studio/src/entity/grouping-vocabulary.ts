import {
  defineEntity,
  parseMarkdownWithFrontmatter,
  type EntityDefinition,
} from "@brains/sdk/entities";
import { parseMarkdown } from "@brains/utils/markdown-frontmatter";
import { z } from "@brains/utils/zod";
import {
  GROUPING_VOCABULARY_TYPE,
  groupingVocabularyFrontmatterSchema,
  type GroupingVocabularyFrontmatter,
} from "../grouping-vocabulary-contract";

/** Strict writes; malformed stored source remains available for administrator repair. */
export function readGroupingVocabulary(
  content: string,
): GroupingVocabularyFrontmatter {
  return parseMarkdownWithFrontmatter(
    content,
    groupingVocabularyFrontmatterSchema,
  ).metadata;
}

export function readStoredGroupingVocabulary(
  content: string,
): GroupingVocabularyFrontmatter {
  const parsed = groupingVocabularyFrontmatterSchema.safeParse(
    parseMarkdown(content).frontmatter,
  );
  return parsed.success ? parsed.data : { groupings: {} };
}

const metadataSchema: z.ZodObject<Record<string, never>> = z.object({});
export const groupingVocabulary: EntityDefinition<
  "grouping-vocabulary",
  typeof metadataSchema
> = defineEntity({
  type: GROUPING_VOCABULARY_TYPE,
  purpose:
    "Admin-authored allowed values and cardinality for Studio groupings.",
  metadata: metadataSchema,
  singleton: true,
  hasBody: false,
  config: {
    embeddable: false,
    projectionSource: false,
    actionPolicy: {
      create: "admin",
      update: "admin",
      delete: "admin",
      publish: "never",
    },
  },
  markdown: {
    frontmatter: groupingVocabularyFrontmatterSchema,
    reconstruct: (content) => ({ content, metadata: {} }),
    encode: ({ content }) => {
      const parsed = parseMarkdownWithFrontmatter(
        content,
        groupingVocabularyFrontmatterSchema,
      );
      return { content: parsed.content, frontmatter: parsed.metadata };
    },
  },
  validatePersist: ({ content, visibility }) => {
    readGroupingVocabulary(content);
    if (visibility !== "shared")
      throw new z.ZodError([
        {
          code: "custom",
          path: ["visibility"],
          message:
            "Grouping vocabularies are always shared, so the editors they constrain can read them.",
        },
      ]);
  },
});
