import { defineEntity, type EntityDefinition } from "@brains/sdk/entities";
import {
  withFrontmatterSchema,
  writesInDocumentOrder,
} from "@brains/sdk/internal/entity-runtime";
import { bookFrontmatterSchema, bookMetadataSchema } from "./schemas/book";

/** The importer writes books through directory-sync; no one edits them. */
export const READ_ONLY = {
  create: "never",
  update: "never",
  delete: "never",
  extract: "never",
  publish: "never",
} as const;

/**
 * A book: its details and contents. Its file states its edition and
 * measure, which the class kept out of metadata: metadata indexes the title
 * alone, and a write keeps the rest of the file's header as it stands, in
 * its order.
 */
export const book: EntityDefinition<"book", typeof bookMetadataSchema> =
  writesInDocumentOrder(
    withFrontmatterSchema(
      defineEntity({
        type: "book",
        purpose:
          "A published book: its title, author, edition and contents. Its text is in its sections.",
        classification: "content",
        metadata: bookMetadataSchema,
        markdown: {
          decode: ({ content, frontmatter }) => ({
            // The class wrote its body from the line under its header.
            content: content.replace(/^\n+/u, ""),
            metadata: { title: bookFrontmatterSchema.parse(frontmatter).title },
          }),
          encode: ({ content, metadata }) => ({
            content: content.replace(/^\n+/u, ""),
            frontmatter: { title: metadata.title },
          }),
        },
        config: {
          includeInBroadSearch: true,
          // A book is its details and contents; its text is in its sections.
          projectionSource: false,
          projectionSourceRole: "excluded",
          actionPolicy: READ_ONLY,
        },
      }),
      bookFrontmatterSchema,
    ),
  );
