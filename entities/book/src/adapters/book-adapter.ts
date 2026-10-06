import { BaseEntityAdapter } from "@brains/plugins";
import {
  bookSchema,
  bookFrontmatterSchema,
  type Book,
  type BookMetadata,
  type BookFrontmatter,
} from "../schemas/book";

export class BookAdapter extends BaseEntityAdapter<
  Book,
  BookMetadata,
  BookFrontmatter
> {
  constructor() {
    super({
      entityType: "book",
      purpose:
        "A section of a published book, kept verbatim and cited by its section.",
      schema: bookSchema,
      frontmatterSchema: bookFrontmatterSchema,
    });
  }

  public fromMarkdown(markdown: string): Partial<Book> {
    const frontmatter = this.parseFrontMatter(markdown, bookFrontmatterSchema);

    return {
      content: markdown,
      entityType: "book",
      metadata: {
        title: frontmatter.title,
        section: frontmatter.section,
        book: frontmatter.book,
        order: frontmatter.order,
        slug: bookEntrySlug(frontmatter.book, frontmatter.order),
      },
    };
  }
}

export const bookAdapter: BookAdapter = new BookAdapter();

/** A book opens at its slug; its entries follow at `<book>/<order>`. */
export function bookEntrySlug(book: string, order: number): string {
  return order === 0 ? book : `${book}/${order}`;
}
