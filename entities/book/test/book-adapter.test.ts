import { describe, expect, it } from "bun:test";
import { parseMarkdownWithFrontmatter } from "@brains/plugins";
import { bookFrontmatterSchema } from "../src/schemas/book";
import { bookSectionFrontmatterSchema } from "../src/schemas/book-section";
import { bookAdapter, bookSectionAdapter } from "./helpers/adapters";

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

describe("the book type", () => {
  it("parses a book's details, opening at its own slug", () => {
    const parsed = bookAdapter.fromMarkdown(bookMarkdown);

    expect(
      parseMarkdownWithFrontmatter(bookMarkdown, bookFrontmatterSchema)
        .metadata,
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

  it("states the frontmatter a book file holds", () => {
    expect(bookAdapter.frontmatterSchema).toBe(bookFrontmatterSchema);
  });
});

describe("the book-section type", () => {
  it("parses a section's place in its book, cited by its siglum", () => {
    const parsed = bookSectionAdapter.fromMarkdown(sectionMarkdown);

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
      ).metadata?.["pageTitle"],
    ).toBe("Erstes Hauptstück");
  });

  it("reads the headings a section stands under", () => {
    expect(
      parseMarkdownWithFrontmatter(
        sectionMarkdown,
        bookSectionFrontmatterSchema,
      ).metadata.headings,
    ).toEqual(["Erster Theil", "Erstes Hauptstück"]);
  });

  it("titles the folders it stands in by its headings, under its book", () => {
    // As Studio reads it: the stored document, with its metadata.
    const stored = {
      content: sectionMarkdown,
      metadata: bookSectionAdapter.fromMarkdown(sectionMarkdown).metadata,
    };
    expect(bookSectionAdapter.getFolderTitles?.(stored)).toEqual([
      undefined,
      "Erster Theil",
      "Erstes Hauptstück",
    ]);
  });

  it("rejects a section outside reading order", () => {
    expect(() =>
      bookSectionAdapter.fromMarkdown(
        sectionMarkdown.replace("order: 1", "order: 0"),
      ),
    ).toThrow();
  });
});
