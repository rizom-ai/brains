import {
  defineEntity,
  parseMarkdownWithFrontmatter,
  type EntityDefinition,
} from "@brains/sdk/entities";
import { parseMarkdown } from "@brains/utils/markdown-frontmatter";
import { z } from "@brains/utils/zod";
import {
  GROUPING_DEFINITIONS_TYPE,
  groupingDefinitionsFrontmatterSchema,
  type GroupingDefinitionsFrontmatter,
} from "../grouping-definitions-contract";

export function readGroupingDefinitions(
  content: string,
): GroupingDefinitionsFrontmatter {
  return parseMarkdownWithFrontmatter(
    content,
    groupingDefinitionsFrontmatterSchema,
  ).metadata;
}
/** The runtime validates each candidate independently, keeping malformed source repairable. */
export function decodeGroupingDefinitions(content: string): unknown {
  const value = parseMarkdown(content, { cache: false }).frontmatter[
    "groupings"
  ];
  return value === undefined ? {} : value;
}
const metadataSchema: z.ZodObject<Record<string, never>> = z.object({});
export const groupingDefinitions: EntityDefinition<
  "grouping-definitions",
  typeof metadataSchema
> = defineEntity({
  type: GROUPING_DEFINITIONS_TYPE,
  classification: "system",
  purpose:
    "Admin-authored grouping names, participating types, cardinality and optional allowed values.",
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
    frontmatter: groupingDefinitionsFrontmatterSchema,
    reconstruct: (content) => ({ content, metadata: {} }),
    encode: ({ content }) => {
      const parsed = parseMarkdownWithFrontmatter(
        content,
        groupingDefinitionsFrontmatterSchema,
      );
      return { content: parsed.content, frontmatter: parsed.metadata };
    },
  },
  validatePersist: ({ content, visibility }) => {
    readGroupingDefinitions(content);
    if (visibility !== "shared")
      throw new z.ZodError([
        {
          code: "custom",
          path: ["visibility"],
          message:
            "Grouping definitions must be shared so their editors can read them.",
        },
      ]);
  },
});
