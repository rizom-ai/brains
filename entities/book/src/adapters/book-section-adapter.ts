import { BaseEntityAdapter } from "@brains/plugins";
import {
  bookSectionSchema,
  bookSectionFrontmatterSchema,
  type BookSection,
  type BookSectionMetadata,
  type BookSectionFrontmatter,
} from "../schemas/book-section";

export class BookSectionAdapter extends BaseEntityAdapter<
  BookSection,
  BookSectionMetadata,
  BookSectionFrontmatter
> {
  constructor() {
    super({
      entityType: "book-section",
      purpose:
        "A section of a published book, kept verbatim and cited by its section.",
      schema: bookSectionSchema,
      frontmatterSchema: bookSectionFrontmatterSchema,
    });
  }

  public fromMarkdown(markdown: string): Partial<BookSection> {
    const frontmatter = this.parseFrontMatter(
      markdown,
      bookSectionFrontmatterSchema,
    );

    return {
      content: markdown,
      entityType: "book-section",
      metadata: {
        title: frontmatter.title,
        section: frontmatter.section,
        book: frontmatter.book,
        order: frontmatter.order,
        slug: bookSectionSlug(frontmatter.book, frontmatter.order),
        pageTitle: frontmatter.section ?? frontmatter.title,
      },
    };
  }

  /** Its book's folder is titled by the book; its headings title the rest. */
  public getFolderTitles(
    entity: Pick<BookSection, "content">,
  ): Array<string | undefined> {
    const { headings } = this.parseFrontMatter(
      entity.content,
      bookSectionFrontmatterSchema,
    );
    return [undefined, ...headings];
  }
}

export const bookSectionAdapter: BookSectionAdapter = new BookSectionAdapter();

/** A book opens at its slug; its sections follow at `<book>/<order>`. */
export function bookSectionSlug(book: string, order: number): string {
  return `${book}/${order}`;
}
