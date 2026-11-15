import { frontmatterRecordFields } from "@brains/contracts";
import { defineEntity, type EntityDefinition } from "@brains/sdk/entities";
import {
  withFolderTitles,
  withFrontmatterSchema,
  writesInDocumentOrder,
} from "@brains/sdk/internal/entity-runtime";
import { READ_ONLY } from "./book-entity";
import { bookSectionSlug } from "./lib/slugs";
import {
  bookSectionFrontmatterSchema,
  bookSectionMetadataSchema,
} from "./schemas/book-section";

/**
 * A section of a book, kept verbatim and cited by its siglum. Metadata
 * indexes what the class indexed (its place, siglum, slug and page title);
 * its page, headings and source stay in the file, and a write keeps them as
 * they stand.
 */
export const bookSection: EntityDefinition<
  "book-section",
  typeof bookSectionMetadataSchema
> = withFolderTitles(
  writesInDocumentOrder(
    withFrontmatterSchema(
      defineEntity({
        type: "book-section",
        purpose:
          "A section of a published book, kept verbatim and cited by its section.",
        classification: "content",
        metadata: bookSectionMetadataSchema,
        markdown: {
          decode: ({ content, frontmatter }) => {
            const fields = bookSectionFrontmatterSchema.parse(frontmatter);
            return {
              // The class wrote its body from the line under its header.
              content: content.replace(/^\n+/u, ""),
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
          encode: ({ content, metadata }) => ({
            content: content.replace(/^\n+/u, ""),
            frontmatter: {
              title: metadata.title,
              book: metadata.book,
              order: metadata.order,
              ...(metadata.section !== null && { section: metadata.section }),
            },
          }),
        },
        config: {
          includeInBroadSearch: true,
          // A book brain's sections are its primary texts; its topics map their themes.
          projectionSourceRole: "canonical",
          // Ids carry zero-padded reading order.
          defaultSort: [{ field: "id", direction: "asc" }],
          actionPolicy: READ_ONLY,
          // A section lives in its book: stored, shown and deleted with it.
          containedIn: "book",
        },
      }),
      bookSectionFrontmatterSchema,
    ),
  ),
  // Its book's folder is titled by the book; its headings title the rest.
  // Studio reads the tree as stored, so the headings are the file's.
  ({ content }) => [undefined, ...headingsOf(content)],
);

function headingsOf(content: string): string[] {
  const parsed = bookSectionFrontmatterSchema
    .pick({ headings: true })
    .safeParse(frontmatterRecordFields({ content }).fields);
  return parsed.success ? parsed.data.headings : [];
}
