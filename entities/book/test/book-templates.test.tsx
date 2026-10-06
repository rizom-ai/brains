/** @jsxImportSource react */
import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup as render } from "react-dom/server";
import type { BookWithData } from "../src/schemas/book";
import { BookListTemplate } from "../src/templates/book-list";
import { BookDetailTemplate } from "../src/templates/book-detail";

const bookDetails = {
  author: "Erfundener Autor",
  year: 1888,
  kind: "work" as const,
  edition: "Testausgabe",
  license: "CC-BY-NC-ND-4.0" as const,
  attribution: "Testquelle, hg. von Niemand",
};

function entry(
  book: string,
  order: number,
  title: string,
  extra: Partial<BookWithData["frontmatter"]> = {},
): BookWithData {
  const slug = order === 0 ? book : `${book}/${order}`;
  const section = order === 0 ? null : `S-${order}`;
  return {
    id: `${book}:${String(order).padStart(4, "0")}`,
    entityType: "book",
    content: "",
    contentHash: slug,
    created: "2026-10-06T00:00:00.000Z",
    updated: "2026-10-06T00:00:00.000Z",
    visibility: "public",
    metadata: {
      title,
      section,
      book,
      order,
      slug,
      pageTitle: section ?? title,
    },
    frontmatter: {
      title,
      book,
      order,
      section,
      page: null,
      source: `https://example.org/${slug}`,
      author: null,
      year: null,
      kind: null,
      edition: null,
      license: null,
      attribution: null,
      ...extra,
    },
    body: `Erfundener Text in **${title}**.`,
  };
}

const erstes = entry("erstes", 0, "Erstes Buch", bookDetails);

describe("BookListTemplate", () => {
  test("links every book with its author and year", () => {
    const html = render(
      <BookListTemplate
        books={[erstes, entry("zweites", 0, "Zweites Buch", bookDetails)]}
      />,
    );

    expect(html).toContain('href="/books/erstes"');
    expect(html).toContain('href="/books/zweites"');
    expect(html).toContain("Erstes Buch");
    expect(html).toContain("Erfundener Autor");
    expect(html).toContain("1888");
  });
});

describe("BookDetailTemplate", () => {
  test("reads a section with its book, citation, source and neighbours", () => {
    const html = render(
      <BookDetailTemplate
        entry={entry("erstes", 2, "Mitte")}
        book={erstes}
        prev={entry("erstes", 1, "Anfang")}
        next={entry("erstes", 3, "Ende")}
        total={3}
      />,
    );

    expect(html).toContain('href="/books/erstes"');
    expect(html).toContain("Mitte");
    expect(html).toContain("S-2");
    expect(html).toContain("<strong>Mitte</strong>");
    expect(html).toContain('href="https://example.org/erstes/2"');
    expect(html).toContain("Testquelle, hg. von Niemand");
    expect(html).toContain("CC BY-NC-ND 4.0");
    expect(html).toContain('href="/books/erstes/1"');
    expect(html).toContain('href="/books/erstes/3"');
  });

  test("sets a section for reading: siglum margin, place in the book, German text", () => {
    const html = render(
      <BookDetailTemplate
        entry={entry("erstes", 2, "Mitte")}
        book={erstes}
        prev={entry("erstes", 1, "Anfang")}
        next={entry("erstes", 3, "Ende")}
        total={3}
      />,
    );

    expect(html).toContain('class="book-siglum');
    expect(html).toContain("section 2 of 3");
    expect(html).toMatch(/class="book-text[^"]*" lang="de"/);
    expect(html).toContain("Source");
    expect(html).toContain("Anfang");
    expect(html).toContain("Ende");
  });

  test("opens a book on its title page with the first section next", () => {
    const html = render(
      <BookDetailTemplate
        entry={erstes}
        book={erstes}
        prev={null}
        next={entry("erstes", 1, "Anfang")}
        total={3}
      />,
    );

    expect(html).toContain("Erstes Buch");
    expect(html).toContain("Erfundener Autor");
    expect(html).toContain("Testausgabe");
    expect(html).toContain('href="/books/erstes/1"');
    expect(html).not.toContain('rel="prev"');
  });
});
