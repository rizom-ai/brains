import {
  bookFrontmatterSchema,
  bookSectionFrontmatterSchema,
} from "@brains/book";
import { parseMarkdownWithFrontmatter } from "@brains/plugins";

/** A book file's fields, as the book type reads them; refused if invalid. */
export function bookFields(markdown: string): Record<string, unknown> {
  return parseMarkdownWithFrontmatter(markdown, bookFrontmatterSchema).metadata;
}

/** A section file's fields, as the book-section type reads them. */
export function sectionFields(markdown: string): Record<string, unknown> {
  return parseMarkdownWithFrontmatter(markdown, bookSectionFrontmatterSchema)
    .metadata;
}
