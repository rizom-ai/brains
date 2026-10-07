import {
  defineEntity,
  generateMarkdownWithFrontmatter,
  parseMarkdown,
  type EntityDefinition,
} from "@brains/sdk/entities";
import { faqFrontmatterSchema, faqMetadataSchema } from "./schemas/faq";
import { faqMetadata } from "./lib/faq-content";
import { faqDataSource } from "./datasources/faq-datasource";
import { getTemplates } from "./templates/faq-section";

/** Authored Q&A with a chosen answer and owner-reviewable alternatives. */
export const faq: EntityDefinition<"faq", typeof faqMetadataSchema> =
  defineEntity({
    type: "faq",
    purpose:
      "A reusable question and answer captured from a chat conversation, kept at the visibility of the turn that answered it.",
    metadata: faqMetadataSchema,
    config: {
      projectionSource: false,
      projectionSourceRole: "excluded",
      includeInBroadSearch: false,
      publish: { publishStatuses: ["published"] },
    },
    markdown: {
      frontmatter: faqFrontmatterSchema,
      decode: ({ content, frontmatter }) => {
        const fields = faqFrontmatterSchema.parse(frontmatter);
        return {
          content: generateMarkdownWithFrontmatter(content, { ...frontmatter }),
          metadata: faqMetadata(fields),
        };
      },
      encode: ({ content }) => {
        const parsed = parseMarkdown(content);
        faqFrontmatterSchema.parse(parsed.frontmatter);
        return { content: parsed.content, frontmatter: parsed.frontmatter };
      },
    },
    dataSources: [faqDataSource],
    templates: getTemplates(),
  });
