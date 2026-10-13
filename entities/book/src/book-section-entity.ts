import {
  defineEntity,
  generateMarkdownWithFrontmatter,
  parseMarkdown,
  type EntityDefinition,
} from "@brains/sdk/entities";
import {
  bookSectionFrontmatterSchema,
  bookSectionMetadataSchema,
} from "./schemas/book-section";

/** A section opens under its book, at <book>/<order>. */
export function bookSectionSlug(book: string, order: number): string {
  return `${book}/${order}`;
}

export const bookSection: EntityDefinition<
  "book-section",
  typeof bookSectionMetadataSchema
> = defineEntity({
  type: "book-section",
  purpose:
    "A section of a published book, kept verbatim and cited by its section.",
  metadata: bookSectionMetadataSchema,
  markdown: {
    frontmatter: bookSectionFrontmatterSchema,
    decode: ({ content, frontmatter }) => {
      const fields = bookSectionFrontmatterSchema.parse(frontmatter);
      return {
        content: generateMarkdownWithFrontmatter(content, { ...frontmatter }),
        metadata: {
          title: fields.title,
          section: fields.section,
          book: fields.book,
          order: fields.order,
          slug: bookSectionSlug(fields.book, fields.order),
          pageTitle: fields.section ?? fields.title,
        },
      };
    },
    encode: ({ content }) => {
      const parsed = parseMarkdown(content);
      bookSectionFrontmatterSchema.parse(parsed.frontmatter);
      return { content: parsed.content, frontmatter: parsed.frontmatter };
    },
  },
  config: {
    includeInBroadSearch: true,
    projectionSourceRole: "canonical",
    defaultSort: [{ field: "id", direction: "asc" }],
    actionPolicy: {
      create: "never",
      update: "never",
      delete: "never",
      extract: "never",
      publish: "never",
    },
  },
});
