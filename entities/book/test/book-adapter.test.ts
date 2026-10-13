import { describe, expect, it } from "bun:test";
import {
  decodeBook,
  encodeBook,
  bookFields,
  decodeSection,
  encodeSection,
  sectionFields,
} from "./helpers/book-codec";

const bookMarkdown = `---
title: Der Antichrist
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

## Contents
`;

const sectionMarkdown = `---
title: Erstes Hauptstück
book: der-antichrist
order: 1
section: AC-1
page: null
headings:
  - Erster Theil
  - Erstes Hauptstück
source: http://www.nietzschesource.org/eKGWB/AC-1
---

Ein erfundener Absatz für den Test.
`;

describe("Book declaration codec", () => {
  it("parses a book's details, opening at its own slug", () => {
    const parsed = decodeBook(bookMarkdown);

    expect(parsed.entityType).toBe("book");
    expect(bookFields(bookMarkdown)).toMatchObject({
      author: "Friedrich Nietzsche",
      year: 1888,
      kind: "work",
      license: "CC-BY-NC-ND-4.0",
      published: false,
      length: 165000,
      sections: 65,
      shortTitle: "Antichrist",
    });
    expect(parsed.metadata).toEqual({
      title: "Der Antichrist",
      citable: false,
    });
  });

  it("rejects a book without a source", () => {
    expect(() =>
      decodeBook("---\ntitle: Ohne Quelle\n---\n\nText.\n"),
    ).toThrow();
  });

  it("rejects an unknown license", () => {
    expect(() =>
      decodeBook(
        bookMarkdown.replace("CC-BY-NC-ND-4.0", "all-rights-reserved"),
      ),
    ).toThrow();
  });

  it("round-trips through markdown without loss", () => {
    const parsed = decodeBook(bookMarkdown);
    const markdown = encodeBook({
      id: "der-antichrist",
      entityType: "book",
      content: parsed.content,
      contentHash: "",
      created: "2026-10-05T00:00:00.000Z",
      updated: "2026-10-05T00:00:00.000Z",
      visibility: "restricted",
      metadata: { title: "Der Antichrist", citable: false },
    });

    expect(decodeBook(markdown).metadata).toEqual(parsed.metadata);
    expect(bookFields(markdown)).toEqual(bookFields(bookMarkdown));
  });
});

describe("Book section declaration codec", () => {
  it("parses a section's place in its book, cited by its siglum", () => {
    const parsed = decodeSection(sectionMarkdown);

    expect(parsed.entityType).toBe("book-section");
    expect(parsed.metadata).toEqual({
      title: "Erstes Hauptstück",
      section: "AC-1",
      book: "der-antichrist",
      order: 1,
      slug: "der-antichrist/1",
      pageTitle: "AC-1",
    });
  });

  it("names a section without a siglum by its title", () => {
    expect(
      decodeSection(sectionMarkdown.replace("section: AC-1", "section: null"))
        .metadata.pageTitle,
    ).toBe("Erstes Hauptstück");
  });

  it("reads the headings a section stands under", () => {
    expect(sectionFields(sectionMarkdown)["headings"]).toEqual([
      "Erster Theil",
      "Erstes Hauptstück",
    ]);
  });

  it("round-trips section text, headings and extension fields without stale metadata overlays", () => {
    const markdown = sectionMarkdown.replace(
      "page: null",
      "page: null\nextension: retained",
    );
    const parsed = decodeSection(markdown);
    const encoded = encodeSection({
      ...parsed,
      id: "der-antichrist:00001-section",
      contentHash: "",
      created: "2026-10-05T00:00:00.000Z",
      updated: "2026-10-05T00:00:00.000Z",
      visibility: "restricted",
      metadata: { ...parsed.metadata, title: "Stale title" },
    });
    expect(decodeSection(encoded).metadata).toEqual(parsed.metadata);
    expect(sectionFields(encoded)).toEqual(sectionFields(markdown));
    expect(encoded).toContain("extension: retained");
    expect(encoded).toContain("Ein erfundener Absatz für den Test.");
  });

  it("rejects a section outside reading order", () => {
    expect(() =>
      decodeSection(sectionMarkdown.replace("order: 1", "order: 0")),
    ).toThrow();
  });
});
