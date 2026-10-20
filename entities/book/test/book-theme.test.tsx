/** @jsxImportSource react */
import { beforeEach, describe, expect, it } from "bun:test";
import { renderToStaticMarkup as render } from "react-dom/server";
import { createMockShell, type MockShell } from "@brains/plugins/test";
import type { BaseDataSourceContext, BaseEntity } from "@brains/plugins";
import { createMockLogger } from "@brains/test-utils";
import { z } from "@brains/utils/zod";
import { bookAdapter } from "../src/adapters/book-adapter";
import { bookSectionAdapter } from "../src/adapters/book-section-adapter";
import { BookThemeDataSource } from "../src/datasources/book-theme-datasource";
import { BookThemeTemplate } from "../src/templates/book-theme";
import { nearestStore, type NearestMatch } from "./helpers/nearest-store";

function bookOf(book: string, title: string, extra: string): BaseEntity {
  const content = `---
title: ${title}
source: https://example.org/${book}
${extra}---

## Contents
`;
  return {
    id: book,
    entityType: "book",
    content,
    contentHash: book,
    created: "2026-10-06T00:00:00.000Z",
    updated: "2026-10-06T00:00:00.000Z",
    visibility: "public",
    metadata: bookAdapter.fromMarkdown(content).metadata ?? {},
  };
}

function sectionOf(
  book: string,
  order: number,
  title: string,
  section = `${book.toUpperCase()}-${order}`,
): BaseEntity {
  const content = `---
title: ${title}
book: ${book}
order: ${order}
section: ${section}
page: null
source: https://example.org/${book}/${order}
---

Erfundener Text ${order}.
`;
  return {
    id: `${book}:${String(order).padStart(5, "0")}`,
    entityType: "book-section",
    content,
    contentHash: `${book}-${order}`,
    created: "2026-10-06T00:00:00.000Z",
    updated: "2026-10-06T00:00:00.000Z",
    visibility: "public",
    metadata: bookSectionAdapter.fromMarkdown(content).metadata ?? {},
  };
}

const details = (year: number, published: boolean): string =>
  `author: Erfundener Autor\nyear: ${year}\nkind: work\npublished: ${published}\nshortTitle: Kurz${year}\n`;

const topic: BaseEntity = {
  id: "mitleid",
  entityType: "topic",
  content: "---\ntitle: Mitleid\n---\n\nEine erfundene Zusammenfassung.\n",
  contentHash: "mitleid",
  created: "2026-10-06T00:00:00.000Z",
  updated: "2026-10-06T00:00:00.000Z",
  visibility: "public",
  metadata: {},
};

const near = (entityId: string, distance: number): NearestMatch => ({
  entityId,
  entityType: "book-section",
  distance,
});

describe("BookThemeDataSource", () => {
  let shell: MockShell;
  let context: BaseDataSourceContext;
  const outputSchema = z.object({
    theme: z.object({ id: z.string(), title: z.string(), summary: z.string() }),
    strand: z.array(z.any()),
    passages: z.array(z.any()),
  });

  beforeEach(() => {
    shell = createMockShell();
    shell.addEntities([
      topic,
      bookOf("frueh", "Ein frühes Buch", details(1872, true)),
      sectionOf("frueh", 1, "Eins"),
      bookOf("spaet", "Ein spätes Buch", details(1888, true)),
      sectionOf("spaet", 1, "Eins"),
      sectionOf("spaet", 2, "Zwei"),
      bookOf("nach", "Ein Nachlass", details(1880, false)),
      sectionOf("nach", 3, "Drei"),
    ]);
    context = {
      entityService: {
        ...shell.getEntityService(),
        nearestToEntity: nearestStore([
          near("spaet:00002", 0.2),
          near("frueh:00001", 0.25),
          near("spaet:00001", 0.3),
          near("nach:00003", 0.45),
          // A book is its details and contents, never a passage.
          { entityId: "frueh", entityType: "book", distance: 0.5 },
          near("weit:00001", 0.9),
        ]),
      },
    };
  });

  it("names the theme from its own page", async () => {
    const result = await new BookThemeDataSource(createMockLogger()).fetch(
      { entityType: "topic", query: { id: "mitleid" } },
      outputSchema,
      context,
    );

    expect(result.theme).toEqual({
      id: "mitleid",
      title: "Mitleid",
      summary: "Eine erfundene Zusammenfassung.",
    });
  });

  it("strands the theme across the books by year, counting its sections there", async () => {
    const result = await new BookThemeDataSource(createMockLogger()).fetch(
      { entityType: "topic", query: { id: "mitleid" } },
      outputSchema,
      context,
    );

    expect(result.strand).toEqual([
      {
        book: "frueh",
        title: "Ein frühes Buch",
        shortTitle: "Kurz1872",
        year: 1872,
        published: true,
        sections: 1,
      },
      {
        book: "nach",
        title: "Ein Nachlass",
        shortTitle: "Kurz1880",
        year: 1880,
        published: false,
        sections: 1,
      },
      {
        book: "spaet",
        title: "Ein spätes Buch",
        shortTitle: "Kurz1888",
        year: 1888,
        published: true,
        sections: 2,
      },
    ]);
  });

  it("offers the closest sections as passages, never a title page", async () => {
    const result = await new BookThemeDataSource(createMockLogger()).fetch(
      { entityType: "topic", query: { id: "mitleid" } },
      outputSchema,
      context,
    );

    expect(result.passages.map((p: { slug: string }) => p.slug)).toEqual([
      "spaet/2",
      "frueh/1",
      "spaet/1",
      "nach/3",
    ]);
    expect(result.passages[0]).toMatchObject({
      section: "SPAET-2",
      title: "Zwei",
      bookTitle: "Ein spätes Buch",
    });
  });
});

describe("BookThemeDataSource with long sections", () => {
  it("counts and offers a section split across entries once", async () => {
    const shell = createMockShell();
    shell.addEntities([
      topic,
      bookOf("spaet", "Ein spätes Buch", details(1888, true)),
      sectionOf("spaet", 1, "Eins"),
      sectionOf("spaet", 2, "Eins", "SPAET-1"),
      sectionOf("spaet", 3, "Drei"),
    ]);
    const context: BaseDataSourceContext = {
      entityService: {
        ...shell.getEntityService(),
        nearestToEntity: nearestStore([
          near("spaet:00002", 0.2),
          near("spaet:00001", 0.25),
          near("spaet:00003", 0.3),
        ]),
      },
    };

    const result = await new BookThemeDataSource(createMockLogger()).fetch(
      { entityType: "topic", query: { id: "mitleid" } },
      z.object({
        strand: z.array(z.object({ sections: z.number() })),
        passages: z.array(z.object({ slug: z.string() })),
      }),
      context,
    );

    expect(result.strand.map((entry) => entry.sections)).toEqual([2]);
    expect(result.passages.map((passage) => passage.slug)).toEqual([
      "spaet/2",
      "spaet/3",
    ]);
  });
});

describe("BookThemeTemplate", () => {
  const props = {
    theme: {
      id: "mitleid",
      title: "Mitleid",
      summary: "Eine erfundene Zusammenfassung.",
    },
    strand: [
      {
        book: "frueh",
        title: "Ein frühes Buch",
        shortTitle: "Kurz1872",
        year: 1872,
        published: true,
        sections: 1,
      },
      {
        book: "spaet",
        title: "Ein spätes Buch",
        shortTitle: "Kurz1888",
        year: 1888,
        published: true,
        sections: 4,
      },
    ],
    passages: [
      {
        slug: "spaet/2",
        title: "Zwei",
        section: "SPAET-2",
        bookTitle: "Ein spätes Buch",
      },
    ],
  };

  it("heads the theme with its reach across the work", () => {
    const html = render(<BookThemeTemplate {...props} />);

    expect(html).toContain("in 2 books · 5 sections");
    expect(html).toContain(">Mitleid</h1>");
    expect(html).toContain("Eine erfundene Zusammenfassung.");
  });

  it("counts a single book and section in the singular", () => {
    const single = {
      book: "spaet",
      title: "Ein spätes Buch",
      shortTitle: null,
      year: 1888,
      published: true,
      sections: 1,
    };
    const html = render(<BookThemeTemplate {...props} strand={[single]} />);

    expect(html).toContain("in 1 book · 1 section<");
    expect(html).toContain('aria-label="Ein spätes Buch, 1888: 1 section"');
  });

  it("heads a theme no book carries without counts", () => {
    const html = render(
      <BookThemeTemplate {...props} strand={[]} passages={[]} />,
    );

    expect(html).toContain(">Theme</p>");
    expect(html).not.toContain("0 books");
  });

  it("draws each book's share of the theme on its year, linked to the book", () => {
    const html = render(<BookThemeTemplate {...props} />);

    expect(html).toMatch(
      /href="\/books\/spaet"[^>]*aria-label="Ein spätes Buch, 1888: 4 sections"[^>]*style="height:120px"/,
    );
    expect(html).toMatch(/href="\/books\/frueh"[^>]*style="height:30px"/);
  });

  it("links the strongest passages with their siglum and book", () => {
    const html = render(<BookThemeTemplate {...props} />);

    expect(html).toContain('href="/books/spaet/2"');
    expect(html).toContain("SPAET-2");
    expect(html).toContain("Ein spätes Buch");
  });

  it("names a passage only where its title says more than its siglum", () => {
    const html = render(
      <BookThemeTemplate
        {...props}
        passages={[
          { slug: "spaet/2", title: "2", section: "SPAET-2", bookTitle: "B" },
          {
            slug: "spaet/3",
            title: "Vorrede",
            section: "SPAET-Vorrede",
            bookTitle: "B",
          },
          {
            slug: "spaet/4",
            title: "Zwischenspiel",
            section: "SPAET-4",
            bookTitle: "B",
          },
        ]}
      />,
    );

    expect(html).not.toContain(">2</span>");
    expect(html).not.toContain(">Vorrede</span>");
    expect(html).toContain(">Zwischenspiel</span>");
  });
});
