import { describe, expect, it } from "bun:test";
import { decodeBook, encodeBook, bookFields } from "./helpers/book-codec";

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
published: false
length: 165000
sections: 65
shortTitle: Antichrist
---

Inhalt.
`;

describe("book declaration codec", () => {
  it("parses a section entry into title and section metadata", () => {
    const parsed = decodeBook(sectionMarkdown);

    expect(parsed.entityType).toBe("book");
    expect(parsed.metadata).toEqual({
      title: "Erstes Hauptstück",
      section: "AC-1",
      book: "der-antichrist",
      order: 1,
      slug: "der-antichrist/1",
      pageTitle: "AC-1",
      citable: true,
    });
  });

  it("reads the part a section belongs to", () => {
    const frontmatter = bookFields(
      sectionMarkdown.replace(
        "section: AC-1",
        "section: AC-1\npart: Erstes Hauptstück",
      ),
    );

    expect(frontmatter["part"]).toBe("Erstes Hauptstück");
  });

  it("parses the title entry's book details", () => {
    const frontmatter = bookFields(titleMarkdown);

    expect(frontmatter).toMatchObject({
      author: "Friedrich Nietzsche",
      year: 1888,
      kind: "work",
      license: "CC-BY-NC-ND-4.0",
      published: false,
      length: 165000,
      sections: 65,
      shortTitle: "Antichrist",
    });
    expect(decodeBook(titleMarkdown).metadata).toEqual({
      title: "Der Antichrist",
      section: null,
      book: "der-antichrist",
      order: 0,
      slug: "der-antichrist",
      pageTitle: "Der Antichrist",
      // A book's contents are no source in themselves; answers cite sections.
      citable: false,
    });
  });

  it("rejects an entry without a source", () => {
    expect(() =>
      decodeBook(`---
title: Ohne Quelle
---

Text.
`),
    ).toThrow();
  });

  it("rejects an unknown license", () => {
    expect(() =>
      decodeBook(
        titleMarkdown.replace("CC-BY-NC-ND-4.0", "all-rights-reserved"),
      ),
    ).toThrow();
  });

  it("round-trips through markdown without loss", () => {
    const parsed = decodeBook(titleMarkdown);
    const markdown = encodeBook({
      id: "der-antichrist:0000-titel",
      entityType: "book",
      content: parsed.content,
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
        pageTitle: "Der Antichrist",
        citable: false,
      },
    });
    const reparsed = decodeBook(markdown);

    expect(reparsed.metadata).toEqual(parsed.metadata);
    expect(bookFields(markdown)).toEqual(bookFields(titleMarkdown));
    expect(markdown).toContain("Inhalt.");
  });
});
