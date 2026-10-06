import { describe, expect, it } from "bun:test";
import { bookAdapter } from "../src/adapters/book-adapter";

const sectionMarkdown = `---
title: Erstes Hauptstück
book: der-antichrist
order: 1
section: AC-1
page: null
source: http://www.nietzschesource.org/eKGWB/AC-1
---

Ein erfundener Absatz für den Test.
`;

const titleMarkdown = `---
title: Der Antichrist
book: der-antichrist
order: 0
section: null
page: null
source: http://www.nietzschesource.org/eKGWB/AC
author: Friedrich Nietzsche
year: 1888
kind: work
edition: Digitale Kritische Gesamtausgabe (eKGWB)
license: CC-BY-NC-ND-4.0
attribution: Nietzsche Source, eKGWB, ed. Paolo D'Iorio
---

Inhalt.
`;

describe("BookAdapter", () => {
  it("parses a section entry into title and section metadata", () => {
    const parsed = bookAdapter.fromMarkdown(sectionMarkdown);

    expect(parsed.entityType).toBe("book");
    expect(parsed.metadata).toEqual({
      title: "Erstes Hauptstück",
      section: "AC-1",
      book: "der-antichrist",
      order: 1,
      slug: "der-antichrist/1",
    });
  });

  it("parses the title entry's book details", () => {
    const frontmatter = bookAdapter.parseFrontMatter(
      titleMarkdown,
      bookAdapter.frontmatterSchema,
    );

    expect(frontmatter).toMatchObject({
      author: "Friedrich Nietzsche",
      year: 1888,
      kind: "work",
      license: "CC-BY-NC-ND-4.0",
    });
    expect(bookAdapter.fromMarkdown(titleMarkdown).metadata).toEqual({
      title: "Der Antichrist",
      section: null,
      book: "der-antichrist",
      order: 0,
      slug: "der-antichrist",
    });
  });

  it("rejects an entry without a source", () => {
    expect(() =>
      bookAdapter.fromMarkdown(`---
title: Ohne Quelle
---

Text.
`),
    ).toThrow();
  });

  it("rejects an unknown license", () => {
    expect(() =>
      bookAdapter.fromMarkdown(
        titleMarkdown.replace("CC-BY-NC-ND-4.0", "all-rights-reserved"),
      ),
    ).toThrow();
  });

  it("round-trips through markdown without loss", () => {
    const parsed = bookAdapter.fromMarkdown(titleMarkdown);
    const markdown = bookAdapter.toMarkdown({
      id: "der-antichrist:0000-titel",
      entityType: "book",
      content: parsed.content ?? "",
      contentHash: "",
      created: "2026-10-05T00:00:00.000Z",
      updated: "2026-10-05T00:00:00.000Z",
      visibility: "restricted",
      metadata: {
        title: "Der Antichrist",
        section: null,
        book: "der-antichrist",
        order: 0,
        slug: "der-antichrist",
      },
    });
    const reparsed = bookAdapter.fromMarkdown(markdown);

    expect(reparsed.metadata).toEqual(parsed.metadata);
    expect(
      bookAdapter.parseFrontMatter(markdown, bookAdapter.frontmatterSchema),
    ).toEqual(
      bookAdapter.parseFrontMatter(
        titleMarkdown,
        bookAdapter.frontmatterSchema,
      ),
    );
    expect(markdown).toContain("Inhalt.");
  });
});
