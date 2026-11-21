import { storedDocumentParts } from "@brains/contracts";
import {
  bookWithDataSchema,
  type Book,
  type BookWithData,
} from "../schemas/book";
import {
  bookSectionWithDataSchema,
  type BookSection,
  type BookSectionWithData,
} from "../schemas/book-section";

/**
 * A book as its pages show it: its stored document's fields and body. Read
 * as stored (`source: true`): its metadata indexes only its title, as the
 * class indexed it, and the file holds the rest.
 */
export function parseBookData(entity: Book): BookWithData {
  const { header, body } = storedDocumentParts(entity.content);
  return bookWithDataSchema.parse({ ...entity, frontmatter: header, body });
}

/** A section as its page shows it, read as stored like a book. */
export function parseBookSectionData(entity: BookSection): BookSectionWithData {
  const { header, body } = storedDocumentParts(entity.content);
  return bookSectionWithDataSchema.parse({
    ...entity,
    frontmatter: header,
    body,
  });
}
