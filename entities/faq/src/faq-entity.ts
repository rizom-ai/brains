import { defineEntity, type EntityDefinition } from "@brains/sdk/entities";
import {
  withFrontmatterSchema,
  writesInDocumentOrder,
} from "@brains/sdk/internal/entity-runtime";
import {
  currentFaqBody,
  faqMetadata,
  frontmatterSources,
} from "./lib/faq-body";
import { faqFrontmatterSchema, faqMetadataSchema } from "./schemas/faq";

/**
 * A FAQ: a question and its answer, captured from a chat. Its frontmatter
 * is its metadata. A body still in a layout from before the formatter, or
 * one whose sources sit in frontmatter or keep their quotes, is read in
 * the formatter's layout, as the class wrote it on its next write.
 */
export const faq: EntityDefinition<"faq", typeof faqMetadataSchema> =
  writesInDocumentOrder(
    withFrontmatterSchema(
      defineEntity({
        type: "faq",
        purpose:
          "A reusable question and answer captured from a chat conversation, kept at the visibility of the turn that answered it.",
        classification: "content",
        metadata: faqMetadataSchema,
        markdown: {
          decode: ({ content, frontmatter }) => ({
            // The class wrote its body from the line under its header.
            content: currentFaqBody(
              content.replace(/^\n+/u, ""),
              frontmatterSources(frontmatter),
            ),
            metadata: faqMetadata(faqFrontmatterSchema.parse(frontmatter)),
          }),
          encode: ({ content, metadata }) => ({
            content: currentFaqBody(content.replace(/^\n+/u, ""), []),
            frontmatter: faqFrontmatterSchema.parse(metadata),
          }),
        },
        config: {
          projectionSource: false,
          projectionSourceRole: "excluded",
          // FAQs restate the brain's own answers; as search sources they would
          // feed unreviewed answers back into new ones.
          includeInBroadSearch: false,
          // Sources moved from frontmatter to the body: read, then rewritten.
          translatedFields: ["sources"],
          publish: { publishStatuses: ["published"] },
        },
      }),
      faqFrontmatterSchema,
    ),
  );
