import { frontmatterRecordFields } from "@brains/contracts";
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
  const { fields, body } = frontmatterRecordFields(entity);
  return bookWithDataSchema.parse({ ...entity, frontmatter: fields, body });
}

/** A section as its page shows it, read as stored like a book. */
export function parseBookSectionData(entity: BookSection): BookSectionWithData {
  const { fields, body } = frontmatterRecordFields(entity);
  return bookSectionWithDataSchema.parse({
    ...entity,
    frontmatter: fields,
    body,
  });
}
