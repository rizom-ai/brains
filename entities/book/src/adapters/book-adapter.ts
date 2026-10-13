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
        "A published book: its title, author, edition and contents. Its text is in its sections.",
      schema: bookSchema,
      frontmatterSchema: bookFrontmatterSchema,
    });
  }

  public fromMarkdown(markdown: string): Partial<Book> {
    const frontmatter = this.parseFrontMatter(markdown, bookFrontmatterSchema);

    return {
      content: markdown,
      entityType: "book",
      metadata: { title: frontmatter.title },
    };
  }
}

export const bookAdapter: BookAdapter = new BookAdapter();
