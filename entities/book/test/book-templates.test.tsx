/** @jsxImportSource react */
import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup as render } from "react-dom/server";
import type { BookWithData } from "../src/schemas/book";
import type { BookSectionWithData } from "../src/schemas/book-section";
import { BookListTemplate } from "../src/templates/book-list";
import {
  BookDetailTemplate,
  BookSectionTemplate,
} from "../src/templates/book-detail";

const bookDetails = {
  author: "Erfundener Autor",
  year: 1888,
  kind: "work" as const,
  edition: "Testausgabe",
  license: "CC-BY-NC-ND-4.0" as const,
  attribution: "Testquelle, hg. von Niemand",
};

function book(
  slug: string,
  title: string,
  extra: Partial<BookWithData["frontmatter"]> = {},
): BookWithData {
  return {
    id: slug,
    entityType: "book",
    content: "",
    contentHash: slug,
    created: "2026-10-06T00:00:00.000Z",
    updated: "2026-10-06T00:00:00.000Z",
    visibility: "public",
    metadata: { title },
    frontmatter: {
      title,
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
    body: "## Contents",
  };
}

function section(
  bookSlug: string,
  order: number,
  title: string,
  extra: Partial<BookSectionWithData["frontmatter"]> = {},
): BookSectionWithData {
  const slug = `${bookSlug}/${order}`;
  const siglum = `S-${order}`;
  return {
    id: `${bookSlug}:${String(order).padStart(4, "0")}`,
    entityType: "book-section",
    content: "",
    contentHash: slug,
    created: "2026-10-06T00:00:00.000Z",
    updated: "2026-10-06T00:00:00.000Z",
    visibility: "public",
    metadata: {
      title,
      section: siglum,
      book: bookSlug,
      order,
      slug,
      pageTitle: siglum,
    },
    frontmatter: {
      title,
      book: bookSlug,
      order,
      section: siglum,
      page: null,
      headings: [],
      source: `https://example.org/${slug}`,
      ...extra,
    },
    body: `Erfundener Text in **${title}**.`,
  };
}

const erstes = book("erstes", "Erstes Buch", bookDetails);

describe("BookListTemplate", () => {
  const shelf = [
    book("lang", "Ein langes Buch", {
      ...bookDetails,
      year: 1872,
      length: 200000,
      sections: 80,
      shortTitle: "Lang",
    }),
    book("halb", "Ein halbes Buch", {
      ...bookDetails,
      year: 1880,
      length: 100000,
      sections: 30,
    }),
    book("nachlass", "Aus dem Nachlass", {
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
    const one = book("eins", "Ein Buch", { ...bookDetails, sections: 1 });
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

  test("labels a spine too short for its title just outside it", () => {
    const html = render(
      <BookListTemplate
        books={[
          ...shelf,
          book("klein", "Ein kleines Buch", {
            ...bookDetails,
            year: 1876,
            length: 1000,
            sections: 2,
            shortTitle: "Klein",
          }),
        ]}
      />,
    );

    expect(html).toMatch(
      /href="\/books\/klein"[^>]*aria-hidden="true"[^>]*tabindex="-1"[^>]*>(<[^>]+>)*Klein</,
    );
  });

  test("labels the last year even off the label step", () => {
    const html = render(
      <BookListTemplate
        books={[
          book("a", "Anfang", { ...bookDetails, year: 1870, length: 10 }),
          book("m", "Mitte", { ...bookDetails, year: 1880, length: 10 }),
          book("e", "Ende", { ...bookDetails, year: 1889, length: 10 }),
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

describe("Book pages", () => {
  test("reads a section with its book, citation, source and neighbours", () => {
    const html = render(
      <BookSectionTemplate
        section={section("erstes", 2, "Mitte")}
        book={erstes}
        prev={section("erstes", 1, "Anfang")}
        next={section("erstes", 3, "Ende")}
        total={3}
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
      <BookSectionTemplate
        section={section("erstes", 2, "Mitte")}
        book={erstes}
        prev={section("erstes", 1, "Anfang")}
        next={section("erstes", 3, "Ende")}
        total={3}
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
      headings: [],
      length: 100,
    },
    {
      slug: "erstes/2",
      title: "Mitte",
      section: "S-2",
      order: 2,
      headings: ["Erster Teil"],
      length: 400,
    },
    {
      slug: "erstes/3",
      title: "Ende",
      section: "S-3",
      order: 3,
      headings: ["Erster Teil"],
      length: 200,
    },
  ];

  test("scores a book: one stroke per section, as tall as its text", () => {
    const html = render(
      <BookDetailTemplate
        book={erstes}
        first={section("erstes", 1, "Vorrede")}
        score={score}
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
        book={erstes}
        first={null}
        score={score.slice(0, 1)}
      />,
    );

    expect(html).toContain("1 section<");
  });

  test("groups the score by part, each part opening at its first section", () => {
    const html = render(
      <BookDetailTemplate
        book={erstes}
        first={section("erstes", 1, "Vorrede")}
        score={score}
      />,
    );

    expect(html).toMatch(/href="\/books\/erstes\/2"[^>]*>Erster Teil</);
    expect(html).toMatch(/href="\/books\/erstes\/1"[^>]*>Vorrede</);
  });

  test("shows a part's divisions beneath it, each with its own strokes", () => {
    const divisions = [
      [],
      ["Erster Teil", "Erstes Kapitel"],
      ["Erster Teil", "Zweites Kapitel"],
    ];
    const parted = [
      ...score.map((section, index) => ({
        ...section,
        headings: divisions[index] ?? [],
      })),
      {
        slug: "erstes/4",
        title: "Schluss",
        section: "S-4",
        order: 4,
        headings: ["Zweiter Teil"],
        length: 50,
      },
    ];
    const html = render(
      <BookDetailTemplate
        book={erstes}
        first={section("erstes", 1, "Vorrede")}
        score={parted}
      />,
    );

    expect(html).toMatch(/href="\/books\/erstes\/2"[^>]*>Erster Teil</);
    expect(html).toMatch(/href="\/books\/erstes\/2"[^>]*>Erstes Kapitel</);
    expect(html).toMatch(/href="\/books\/erstes\/3"[^>]*>Zweites Kapitel</);
    expect(html).toMatch(/href="\/books\/erstes\/4"[^>]*>Zweiter Teil</);
    expect(html.indexOf("Erster Teil")).toBeLessThan(
      html.indexOf("Erstes Kapitel"),
    );
  });

  test("places a section under its part and division", () => {
    const placed = section("erstes", 2, "Mitte", {
      headings: ["Erster Teil", "Erstes Kapitel"],
    });
    const html = render(
      <BookSectionTemplate
        section={placed}
        book={erstes}
        prev={null}
        next={null}
        total={3}
        themes={[]}
      />,
    );

    expect(html).toContain("Erster Teil · Erstes Kapitel");
  });

  test("asks about a section by its title and wraps a long siglum", () => {
    const html = render(
      <BookSectionTemplate
        section={section("erstes", 2, "Mitte")}
        book={erstes}
        prev={null}
        next={null}
        total={3}
        themes={[]}
      />,
    );

    expect(html).toContain("Ask about Mitte");
    expect(html).toMatch(/class="book-siglum[^"]*overflow-wrap:anywhere/);
  });

  test("hyphenates a long German title instead of letting it overrun", () => {
    const html = render(
      <BookDetailTemplate book={erstes} first={null} score={[]} />,
    );

    expect(html).toMatch(/<h1 class="[^"]*hyphens-auto[^"]*" lang="de"/);
  });

  test("sets a title with a long word a size smaller", () => {
    const long = book("lang", "Menschliches, Allzumenschliches", bookDetails);
    const html = render(
      <BookDetailTemplate book={long} first={null} score={[]} />,
    );
    const short = render(
      <BookDetailTemplate book={erstes} first={null} score={[]} />,
    );

    expect(html).toMatch(/<h1 class="[^"]*md:text-4xl[^"]*" lang="de"/);
    expect(short).toMatch(/<h1 class="[^"]*md:text-6xl[^"]*" lang="de"/);
  });

  test("sets a siglum with a long segment a size smaller", () => {
    const longSiglum = {
      ...section("erstes", 2, "Mitte"),
      metadata: {
        ...section("erstes", 2, "Mitte").metadata,
        section: "Za-I-Verwandlungen",
      },
    };
    const short = render(
      <BookSectionTemplate
        section={section("erstes", 2, "Mitte")}
        book={erstes}
        prev={null}
        next={null}
        total={3}
        themes={[]}
      />,
    );
    const html = render(
      <BookSectionTemplate
        section={longSiglum}
        book={erstes}
        prev={null}
        next={null}
        total={3}
        themes={[]}
      />,
    );

    expect(short).toMatch(/class="book-siglum[^"]*md:text-4xl/);
    expect(html).toMatch(/class="book-siglum[^"]*md:text-2xl/);
  });

  test("asks about an editorial unit by the heading it opens", () => {
    const base = section("erstes", 2, "Titel", { headings: ["Zweiter Theil"] });
    const titlePage = {
      ...base,
      metadata: { ...base.metadata, section: "S-II-[Titel]" },
    };
    const html = render(
      <BookSectionTemplate
        section={titlePage}
        book={erstes}
        prev={null}
        next={null}
        total={3}
        themes={[]}
      />,
    );

    expect(html).toContain("Ask about Zweiter Theil");
  });

  test("names a neighbour once when its title is its siglum", () => {
    const html = render(
      <BookSectionTemplate
        section={section("erstes", 2, "Mitte")}
        book={erstes}
        prev={null}
        next={section("erstes", 3, "S-3")}
        total={3}
        themes={[]}
      />,
    );

    expect(html.match(/S-3/g)?.length).toBe(1);
  });

  test("renders spaced emphasis only on its words, editorial brackets as text", () => {
    const emphasised = {
      ...section("erstes", 2, "Mitte"),
      body: "Ein *gespro*\\<*chenes*\\> Wort, dann *zusammen* und ein Stern \\* hier.",
    };
    const html = render(
      <BookSectionTemplate
        section={emphasised}
        book={erstes}
        prev={null}
        next={null}
        total={3}
        themes={[]}
      />,
    );

    expect(html).toContain(
      "<em>gespro</em>&lt;<em>chenes</em>&gt; Wort, dann <em>zusammen</em> und ein Stern * hier.",
    );
  });

  test("names a section's themes in the margin, linked to their pages", () => {
    const html = render(
      <BookSectionTemplate
        section={section("erstes", 2, "Mitte")}
        book={erstes}
        prev={null}
        next={null}
        total={3}
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
      <BookSectionTemplate
        section={section("erstes", 2, "Mitte")}
        book={erstes}
        prev={null}
        next={null}
        total={3}
        themes={[]}
      />,
    );

    expect(html).not.toContain("Themes in this section");
  });

  test("offers to ask about the section, its siglum already in the question", () => {
    const html = render(
      <BookSectionTemplate
        section={section("erstes", 2, "Mitte")}
        book={erstes}
        prev={null}
        next={null}
        total={3}
        themes={[]}
      />,
    );

    expect(html).toMatch(
      /href="\/ask\?q=About%20S-2%3A%20"[^>]*>Ask about Mitte/,
    );
  });

  test("opens a book on its title page with the first section next", () => {
    const html = render(
      <BookDetailTemplate
        book={erstes}
        first={section("erstes", 1, "Anfang")}
        score={[]}
      />,
    );

    expect(html).toContain("Erstes Buch");
    expect(html).toContain("Erfundener Autor");
    expect(html).toContain("Testausgabe");
    expect(html).toMatch(/href="\/books\/erstes\/1"[^>]*>Begin reading →</);
    expect(html).not.toContain('rel="prev"');
  });
});
