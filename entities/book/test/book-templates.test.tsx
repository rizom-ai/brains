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
      part: null,
      source: `https://example.org/${slug}`,
      author: null,
      year: null,
      kind: null,
      edition: null,
      license: null,
      attribution: null,
      published: null,
      length: null,
      sections: null,
      shortTitle: null,
      ...extra,
    },
    body: `Erfundener Text in **${title}**.`,
  };
}

const erstes = entry("erstes", 0, "Erstes Buch", bookDetails);

describe("BookListTemplate", () => {
  const shelf = [
    entry("lang", 0, "Ein langes Buch", {
      ...bookDetails,
      year: 1872,
      length: 200000,
      sections: 80,
      shortTitle: "Lang",
    }),
    entry("halb", 0, "Ein halbes Buch", {
      ...bookDetails,
      year: 1880,
      length: 100000,
      sections: 30,
    }),
    entry("nachlass", 0, "Aus dem Nachlass", {
      ...bookDetails,
      year: 1888,
      length: 50000,
      sections: 10,
      published: false,
    }),
  ];

  test("heads the work with its author, years and size", () => {
    const html = render(<BookListTemplate books={shelf} />);

    expect(html.replace(/<[^>]+>/g, "")).toContain("The Work");
    expect(html).toContain("1872");
    expect(html).toContain("1888");
    expect(html).toContain("Erfundener Autor");
    expect(html).toContain("3 books · 120 sections");
  });

  test("counts a single book and section in the singular", () => {
    const one = entry("eins", 0, "Ein Buch", { ...bookDetails, sections: 1 });
    const html = render(<BookListTemplate books={[one]} />);

    expect(html).toContain("1 book · 1 section<");
  });

  test("stands every book on the horizon as a linked spine", () => {
    const html = render(<BookListTemplate books={shelf} />);

    expect(html).toContain('href="/books/lang"');
    expect(html).toContain('href="/books/halb"');
    expect(html).toContain('href="/books/nachlass"');
    expect(html).toContain('aria-label="Ein langes Buch, 1872"');
  });

  test("makes each spine as tall as its text, the longest the tallest", () => {
    const html = render(<BookListTemplate books={shelf} />);

    expect(html).toMatch(
      /aria-label="Ein langes Buch, 1872"[^>]*style="[^"]*height:280px/,
    );
    expect(html).toMatch(
      /aria-label="Ein halbes Buch, 1880"[^>]*style="[^"]*height:140px/,
    );
  });

  test("hangs posthumous writings below the line", () => {
    const html = render(<BookListTemplate books={shelf} />);

    expect(html).toMatch(
      /aria-label="Aus dem Nachlass, 1888"[^>]*data-published="false"/,
    );
    expect(html).toMatch(
      /aria-label="Ein langes Buch, 1872"[^>]*data-published="true"/,
    );
  });

  test("labels a spine with its short title", () => {
    const html = render(<BookListTemplate books={shelf} />);

    expect(html).toContain(">Lang</span>");
  });

  test("labels the last year even off the label step", () => {
    const html = render(
      <BookListTemplate
        books={[
          entry("a", 0, "Anfang", { ...bookDetails, year: 1870, length: 10 }),
          entry("m", 0, "Mitte", { ...bookDetails, year: 1880, length: 10 }),
          entry("e", 0, "Ende", { ...bookDetails, year: 1889, length: 10 }),
        ]}
      />,
    );

    const axisLabel = (year: number): RegExp =>
      new RegExp(
        `class="pt-5 font-mono text-\\[11px\\] text-theme-light">${year}</span>`,
      );

    expect(html).toMatch(axisLabel(1870));
    expect(html).toMatch(axisLabel(1889));
    expect(html).not.toMatch(axisLabel(1871));
  });

  test("lists every book by year for small screens", () => {
    const html = render(<BookListTemplate books={shelf} />);

    expect(html.match(/class="book-year-list/g)).toHaveLength(1);
    expect(html).toContain("Aus dem Nachlass");
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
        score={[]}
        themes={[]}
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
        score={[]}
        themes={[]}
      />,
    );

    expect(html).toContain('class="book-siglum');
    expect(html).toContain("section 2 of 3");
    expect(html).toMatch(/class="book-text[^"]*" lang="de"/);
    expect(html).toContain("Source");
    expect(html).toContain("Anfang");
    expect(html).toContain("Ende");
  });

  const score = [
    {
      slug: "erstes/1",
      title: "Vorrede",
      section: "S-1",
      order: 1,
      part: null,
      length: 100,
    },
    {
      slug: "erstes/2",
      title: "Mitte",
      section: "S-2",
      order: 2,
      part: "Erster Teil",
      length: 400,
    },
    {
      slug: "erstes/3",
      title: "Ende",
      section: "S-3",
      order: 3,
      part: "Erster Teil",
      length: 200,
    },
  ];

  test("scores a book: one stroke per section, as tall as its text", () => {
    const html = render(
      <BookDetailTemplate
        entry={erstes}
        book={erstes}
        prev={null}
        next={entry("erstes", 1, "Vorrede")}
        total={3}
        score={score}
        themes={[]}
      />,
    );

    expect(html).toMatch(/href="\/books\/erstes\/2"[^>]*style="height:46px"/);
    expect(html).toMatch(/href="\/books\/erstes\/3"[^>]*style="height:23px"/);
    expect(html).toContain('title="S-2 · Mitte"');
    expect(html).toContain("3 sections");
  });

  test("counts a one-section book in the singular", () => {
    const html = render(
      <BookDetailTemplate
        entry={erstes}
        book={erstes}
        prev={null}
        next={null}
        total={1}
        score={score.slice(0, 1)}
        themes={[]}
      />,
    );

    expect(html).toContain("1 section<");
  });

  test("groups the score by part, each part opening at its first section", () => {
    const html = render(
      <BookDetailTemplate
        entry={erstes}
        book={erstes}
        prev={null}
        next={entry("erstes", 1, "Vorrede")}
        total={3}
        score={score}
        themes={[]}
      />,
    );

    expect(html).toMatch(/href="\/books\/erstes\/2"[^>]*>Erster Teil</);
    expect(html).toMatch(/href="\/books\/erstes\/1"[^>]*>Vorrede</);
  });

  test("renders spaced emphasis only on its words, editorial brackets as text", () => {
    const section = {
      ...entry("erstes", 2, "Mitte"),
      body: "Ein *gespro*\\<*chenes*\\> Wort, dann *zusammen* und ein Stern \\* hier.",
    };
    const html = render(
      <BookDetailTemplate
        entry={section}
        book={erstes}
        prev={null}
        next={null}
        total={3}
        score={[]}
        themes={[]}
      />,
    );

    expect(html).toContain(
      "<em>gespro</em>&lt;<em>chenes</em>&gt; Wort, dann <em>zusammen</em> und ein Stern * hier.",
    );
  });

  test("names a section's themes in the margin, linked to their pages", () => {
    const html = render(
      <BookDetailTemplate
        entry={entry("erstes", 2, "Mitte")}
        book={erstes}
        prev={null}
        next={null}
        total={3}
        score={[]}
        themes={[
          { id: "mitleid", title: "Mitleid" },
          { id: "wille-zur-macht", title: "Wille zur Macht" },
        ]}
      />,
    );

    expect(html).toContain("Themes in this section");
    expect(html).toMatch(/href="\/topics\/mitleid"[^>]*>Mitleid</);
    expect(html).toMatch(
      /href="\/topics\/wille-zur-macht"[^>]*>Wille zur Macht</,
    );
  });

  test("leaves the margin empty when a section has no themes", () => {
    const html = render(
      <BookDetailTemplate
        entry={entry("erstes", 2, "Mitte")}
        book={erstes}
        prev={null}
        next={null}
        total={3}
        score={[]}
        themes={[]}
      />,
    );

    expect(html).not.toContain("Themes in this section");
  });

  test("opens a book on its title page with the first section next", () => {
    const html = render(
      <BookDetailTemplate
        entry={erstes}
        book={erstes}
        prev={null}
        next={entry("erstes", 1, "Anfang")}
        total={3}
        score={[]}
        themes={[]}
      />,
    );

    expect(html).toContain("Erstes Buch");
    expect(html).toContain("Erfundener Autor");
    expect(html).toContain("Testausgabe");
    expect(html).toContain('href="/books/erstes/1"');
    expect(html).not.toContain('rel="prev"');
  });
});
