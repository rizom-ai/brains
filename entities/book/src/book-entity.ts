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

export const book: EntityDefinition<"book", typeof bookMetadataSchema> =
  defineEntity({
    type: "book",
    purpose:
      "A published book: its title, author, edition and contents. Its text is in its sections.",
    metadata: bookMetadataSchema,
    markdown: {
      frontmatter: bookFrontmatterSchema,
      decode: ({ content, frontmatter }) => {
        const fields = bookFrontmatterSchema.parse(frontmatter);
        return {
          content: generateMarkdownWithFrontmatter(content, { ...frontmatter }),
          metadata: {
            title: fields.title,
            citable: false,
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
      projectionSource: false,
      projectionSourceRole: "excluded",
      actionPolicy: {
        create: "never",
        update: "never",
        delete: "never",
        extract: "never",
        publish: "never",
      },
    },
    instructions: [
      'Books (entityType "book") hold an author\'s works; their text is in their sections (entityType "book-section"), whose `section` is their siglum.',
      'When a question concerns the author\'s ideas or texts, search the sections first: system_search with scope { kind: "type", entityType: "book-section" }.',
      "Ground every claim in sections you found, and cite each section by its siglum and its book's title.",
      "Quote the text verbatim, in the language of the text, even when you answer in another language.",
      "When the books hold nothing on the question, say that the books do not address it instead of answering from general knowledge.",
    ].join("\n"),
    templates: getTemplates(),
    dataSources: [bookDataSource, bookThemeDataSource],
  });
