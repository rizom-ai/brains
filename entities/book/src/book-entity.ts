import {
  defineEntity,
  generateMarkdownWithFrontmatter,
  parseMarkdown,
  type EntityDefinition,
} from "@brains/sdk/entities";
import { bookFrontmatterSchema, bookMetadataSchema } from "./schemas/book";
import { bookDataSource } from "./datasources/book-datasource";
import { bookThemeDataSource } from "./datasources/book-theme-datasource";
import { getTemplates } from "./lib/register-templates";

/** A book opens at its slug; its entries follow at <book>/<order>. */
export function bookEntrySlug(book: string, order: number): string {
  return order === 0 ? book : `${book}/${order}`;
}

export const book: EntityDefinition<"book", typeof bookMetadataSchema> =
  defineEntity({
    type: "book",
    purpose:
      "A section of a published book, kept verbatim and cited by its section.",
    metadata: bookMetadataSchema,
    markdown: {
      frontmatter: bookFrontmatterSchema,
      decode: ({ content, frontmatter }) => {
        const fields = bookFrontmatterSchema.parse(frontmatter);
        return {
          content: generateMarkdownWithFrontmatter(content, { ...frontmatter }),
          metadata: {
            title: fields.title,
            section: fields.section,
            book: fields.book,
            order: fields.order,
            slug: bookEntrySlug(fields.book, fields.order),
            pageTitle:
              fields.order === 0
                ? fields.title
                : (fields.section ?? fields.title),
            citable: fields.order !== 0,
          },
        };
      },
      encode: ({ content }) => {
        const parsed = parseMarkdown(content);
        bookFrontmatterSchema.parse(parsed.frontmatter);
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
    instructions: [
      "Books (entityType \"book\") hold an author's texts, one entry per section; an entry's `section` is its siglum.",
      'When a question concerns the author\'s ideas or texts, search the books first: system_search with scope { kind: "type", entityType: "book" }.',
      "Ground every claim in sections you found, and cite each section by its siglum and its book's title.",
      "Quote the text verbatim, in the language of the text, even when you answer in another language.",
      "When the books hold nothing on the question, say that the books do not address it instead of answering from general knowledge.",
    ].join("\n"),
    templates: getTemplates(),
    dataSources: [bookDataSource, bookThemeDataSource],
  });
