/** @jsxImportSource react */
import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup as render } from "react-dom/server";
import type { BookWithData } from "../src/schemas/book";
import type { BookSectionWithData } from "../src/schemas/book-section";
import type { BookSectionLink, ScoreEntry } from "../src/schemas/book-pages";
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
      continuations: [],
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

/** A link to a section, as a pager or a title page shows it. */
function link(bookSlug: string, order: number, title: string): BookSectionLink {
  return { slug: `${bookSlug}/${order}`, title, section: `S-${order}` };
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

  /** One short book a year, each titled by its year. */
  const yearly = (years: number[], shelf = "b"): BookWithData[] =>
    years.map((year) =>
      book(`${shelf}${year}`, `Buch ${year}`, {
        ...bookDetails,
        year,
        length: 10,
      }),
    );
  const span = (from: number, to: number): number[] =>
    Array.from({ length: to - from + 1 }, (_, i) => from + i);
  const axisLabel = (year: number): string => `data-axis-year="${year}"`;

  test("labels the first and the last year", () => {
    const html = render(
      <BookListTemplate books={yearly([1870, 1880, 1889])} />,
    );

    expect(html).toContain(axisLabel(1870));
    expect(html).toContain(axisLabel(1889));
    expect(html).not.toContain(axisLabel(1871));
  });

  test("labels years with books, never two too close to read", () => {
    const html = render(<BookListTemplate books={yearly(span(1842, 1853))} />);

    expect(html).toContain(axisLabel(1842));
    expect(html).not.toContain(axisLabel(1843));
    expect(html).toContain(axisLabel(1844));
    expect(html).not.toContain(axisLabel(1852));
    expect(html).toContain(axisLabel(1853));
  });

  test("a year's label never widens its year", () => {
    const html = render(<BookListTemplate books={yearly([1870, 1889])} />);

    expect(html).toMatch(/data-axis-year="1870" class="[^"]*\babsolute\b/);
  });

  test("folds a long run of years without books into one break", () => {
    const html = render(
      <BookListTemplate books={yearly([1842, 1843, 1939])} />,
    );

    expect(html).toContain('data-gap="1844–1938"');
    expect(html).not.toContain(axisLabel(1900));
  });

  test("keeps a short run of years without books on the scale", () => {
    const html = render(<BookListTemplate books={yearly([1870, 1875])} />);

    expect(html).not.toContain("data-gap");
  });

  test("draws the horizon from the narrowest screen its spines fit", () => {
    const few = render(<BookListTemplate books={yearly(span(1870, 1889))} />);
    const many = render(
      <BookListTemplate
        books={[...yearly(span(1842, 1869)), ...yearly(span(1842, 1869), "c")]}
      />,
    );

    expect(few).toContain("hidden md:grid");
    expect(few).toContain("md:hidden");
    expect(many).toContain("hidden xl:grid");
    expect(many).toContain("xl:hidden");
  });

  test("narrows a crowded shelf's spines, its titles left to hover and list", () => {
    const crowded = span(1890, 1939).flatMap((year) =>
      [1, 2, 3].map((n) =>
        book(`b${year}-${n}`, `Buch ${year}-${n}`, {
          ...bookDetails,
          year,
          length: 10,
          shortTitle: "Kurz",
        }),
      ),
    );
    const html = render(<BookListTemplate books={crowded} />);
    const width = Number(
      html.match(/aria-label="Buch 1890-1, 1890"[^>]*width:(\d+)px/)?.[1],
    );

    expect(width).toBeLessThan(14);
    expect(html).not.toContain(">Kurz</span>");
    expect(html).toContain('title="Buch 1890-1, 1890"');
    expect(html).toContain(">Buch 1890-1</a>");
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
        prev={link("erstes", 1, "Anfang")}
        next={link("erstes", 3, "Ende")}
        position={2}
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
        prev={link("erstes", 1, "Anfang")}
        next={link("erstes", 3, "Ende")}
        position={2}
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
        first={link("erstes", 1, "Vorrede")}
        score={score}
      />,
    );

    expect(html).toMatch(/href="\/books\/erstes\/2"[^>]*style="height:46px"/);
    expect(html).toMatch(/href="\/books\/erstes\/3"[^>]*style="height:23px"/);
    expect(html).toContain('title="S-2 · Mitte"');
    expect(html).toContain("3 sections");
  });

  test("offers the book as an EPUB opposite the start of reading", () => {
    const html = render(
      <BookDetailTemplate
        book={erstes}
        first={link("erstes", 1, "Vorrede")}
        score={score}
      />,
    );

    expect(html).toMatch(
      /<a href="\/books\/erstes\.epub" download=""[^>]*>Download EPUB ↓<\/a>/,
    );
    expect(html.indexOf("Download EPUB")).toBeLessThan(
      html.indexOf("Begin reading"),
    );
  });

  test("offers no EPUB for a book without sections", () => {
    const html = render(
      <BookDetailTemplate book={erstes} first={null} score={[]} />,
    );

    expect(html).not.toContain(".epub");
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
        first={link("erstes", 1, "Vorrede")}
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
        first={link("erstes", 1, "Vorrede")}
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
        position={2}
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
        position={2}
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
        position={2}
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
        position={2}
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
        position={2}
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
        next={link("erstes", 3, "S-3")}
        position={2}
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
        position={2}
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
        position={2}
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
        position={2}
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
        position={2}
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
        first={link("erstes", 1, "Anfang")}
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

describe("The score as the book's contents", () => {
  let order = 0;
  /** A score entry; its siglum is its title unless given. */
  function unit(
    title: string,
    headings: string[] = [],
    siglum: string = title,
  ): ScoreEntry {
    order += 1;
    return {
      slug: `werk/${order}`,
      title,
      section: siglum,
      order,
      headings,
      length: 100,
    };
  }
  const score = (entries: ScoreEntry[]): string =>
    render(<BookDetailTemplate book={erstes} first={null} score={entries} />);
  const labelled = (order: number, label: string): RegExp =>
    new RegExp(`href="/books/werk/${order}"[^>]*>${label}<`);

  test("lists every titled unit of a part, whether or not any is split", () => {
    order = 0;
    const html = score([
      unit("Titel", ["Zweiter Theil"], "Za-II-[Titel]"),
      unit("Za-II-[Motto]", ["Zweiter Theil"]),
      unit("Das Kind mit dem Spiegel", ["Zweiter Theil"]),
      unit("Auf den glückseligen Inseln", ["Zweiter Theil"]),
    ]);

    expect(html).toMatch(labelled(1, "Zweiter Theil"));
    // The motto is a text the edition named: listed, without its brackets.
    expect(html).toMatch(labelled(2, "Motto"));
    expect(html).toMatch(labelled(3, "Das Kind mit dem Spiegel"));
    expect(html).toMatch(labelled(4, "Auf den glückseligen Inseln"));
    // The part title page is a stroke on the part's line, not an entry.
    expect(html).not.toContain(">Titel<");
  });

  test("draws numbered aphorisms as strokes on their chapter's line", () => {
    order = 0;
    const html = score([
      unit("1", ["Erstes Hauptstück"]),
      unit("2", ["Erstes Hauptstück"]),
      unit("65a", ["Erstes Hauptstück"]),
    ]);

    expect(html).toMatch(labelled(1, "Erstes Hauptstück"));
    expect(html).not.toMatch(/>(1|2|65a)</);
    expect(html.match(/style="height:/g)).toHaveLength(3);
  });

  test("lists a division's titled units beneath it, in reading order", () => {
    order = 0;
    const html = score([
      unit("1", ["Erster Theil", "Die Vorrede"]),
      unit("2", ["Erster Theil", "Die Vorrede"]),
      unit("Von den drei Verwandlungen", ["Erster Theil", "Die Reden"]),
      unit("Von den Hinterweltlern", ["Erster Theil", "Die Reden"]),
    ]);

    expect(html).toMatch(labelled(1, "Erster Theil"));
    expect(html).toMatch(labelled(1, "Die Vorrede"));
    expect(html).toMatch(labelled(3, "Die Reden"));
    expect(html).toMatch(labelled(3, "Von den drei Verwandlungen"));
    expect(html).toMatch(labelled(4, "Von den Hinterweltlern"));
    expect(html.indexOf("Die Reden")).toBeLessThan(
      html.indexOf("Von den drei Verwandlungen"),
    );
  });

  test("names a book that is one undivided text by its title", () => {
    order = 0;
    const html = score([
      unit("Titel", [], "NJ-[Titel]"),
      unit("[1]", [], "NJ-1"),
      unit("[1]", [], "NJ-1"),
    ]);

    expect(html).toMatch(labelled(2, "Erstes Buch"));
    expect(html).not.toMatch(/>1</);
    expect(html.match(/style="height:/g)).toHaveLength(3);
  });

  test("keeps a range when a book is one run of several numbered sections", () => {
    order = 0;
    const html = score([unit("1"), unit("2"), unit("3")]);

    expect(html).toMatch(labelled(1, "1–3"));
  });

  test("draws a book's own title page on its opening line, not a line of its own", () => {
    order = 0;
    const html = score([
      unit("Titel", [], "GT-[Titel]"),
      unit("Vorwort", [], "GT-Vorwort"),
      unit("1"),
    ]);

    expect(html).not.toContain(">Titel<");
    expect(html).toMatch(labelled(2, "Vorwort"));
    expect(html.match(/style="height:/g)).toHaveLength(3);
  });

  test("gives a titled unit split across sections one row", () => {
    order = 0;
    const html = score([
      unit("Vortrag I", [], "BA-I"),
      unit("Vortrag I", [], "BA-I"),
      unit("Vortrag II", [], "BA-II"),
    ]);

    expect(html.match(/>Vortrag I</g)).toHaveLength(1);
    expect(html).toMatch(labelled(1, "Vortrag I"));
    expect(html).toMatch(labelled(3, "Vortrag II"));
  });

  test("names a run of numbered sections by its range and an edition-named text by its name", () => {
    order = 0;
    const html = score([
      unit("Vorwort", [], "AC-Vorwort"),
      unit("1"),
      unit("2"),
      unit("3"),
      unit("[Gesetz]", [], "AC-Gesetz"),
    ]);

    expect(html).toMatch(labelled(1, "Vorwort"));
    expect(html).toMatch(labelled(2, "1–3"));
    expect(html).toMatch(labelled(5, "Gesetz"));
  });
});
