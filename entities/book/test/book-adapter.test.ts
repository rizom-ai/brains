import { describe, expect, it } from "bun:test";
import { bookAdapter } from "../src/adapters/book-adapter";
import { bookSectionAdapter } from "../src/adapters/book-section-adapter";

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

describe("BookAdapter", () => {
  it("parses a book's details, opening at its own slug", () => {
    const parsed = bookAdapter.fromMarkdown(bookMarkdown);

    expect(parsed.entityType).toBe("book");
    expect(
      bookAdapter.parseFrontMatter(bookMarkdown, bookAdapter.frontmatterSchema),
    ).toMatchObject({
      author: "Friedrich Nietzsche",
      year: 1888,
      kind: "work",
      license: "CC-BY-NC-ND-4.0",
      published: false,
      length: 165000,
      sections: 65,
      shortTitle: "Antichrist",
    });
    expect(parsed.metadata).toEqual({ title: "Der Antichrist" });
  });

  it("rejects a book without a source", () => {
    expect(() =>
      bookAdapter.fromMarkdown("---\ntitle: Ohne Quelle\n---\n\nText.\n"),
    ).toThrow();
  });

  it("rejects an unknown license", () => {
    expect(() =>
      bookAdapter.fromMarkdown(
        bookMarkdown.replace("CC-BY-NC-ND-4.0", "all-rights-reserved"),
      ),
    ).toThrow();
  });

  it("round-trips through markdown without loss", () => {
    const parsed = bookAdapter.fromMarkdown(bookMarkdown);
    const markdown = bookAdapter.toMarkdown({
      id: "der-antichrist",
      entityType: "book",
      content: parsed.content ?? "",
      contentHash: "",
      created: "2026-10-05T00:00:00.000Z",
      updated: "2026-10-05T00:00:00.000Z",
      visibility: "restricted",
      metadata: { title: "Der Antichrist" },
    });

    expect(bookAdapter.fromMarkdown(markdown).metadata).toEqual(
      parsed.metadata,
    );
    expect(
      bookAdapter.parseFrontMatter(markdown, bookAdapter.frontmatterSchema),
    ).toEqual(
      bookAdapter.parseFrontMatter(bookMarkdown, bookAdapter.frontmatterSchema),
    );
  });
});

describe("BookSectionAdapter", () => {
  it("parses a section's place in its book, cited by its siglum", () => {
    const parsed = bookSectionAdapter.fromMarkdown(sectionMarkdown);

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
      bookSectionAdapter.fromMarkdown(
        sectionMarkdown.replace("section: AC-1", "section: null"),
      ).metadata?.pageTitle,
    ).toBe("Erstes Hauptstück");
  });

  it("reads the headings a section stands under", () => {
    expect(
      bookSectionAdapter.parseFrontMatter(
        sectionMarkdown,
        bookSectionAdapter.frontmatterSchema,
      )["headings"],
    ).toEqual(["Erster Theil", "Erstes Hauptstück"]);
  });

  it("rejects a section outside reading order", () => {
    expect(() =>
      bookSectionAdapter.fromMarkdown(
        sectionMarkdown.replace("order: 1", "order: 0"),
      ),
    ).toThrow();
  });
});
