import { describe, expect, test } from "bun:test";
import { relative } from "node:path";
import { buildEntityFilePath, parseEntityPath } from "../src/lib/entity-paths";

// Captured against the released implementation BEFORE codec adoption.
// These are placement observations, not validation rules or approval of unsafe IDs.
// Keep the expected paths unchanged when changing the implementation.
const placements = [
  ["note", "intro", ".md", "intro.md"],
  ["note", "note:intro", ".md", "intro.md"],
  ["note", "book:intro", ".md", "book/intro.md"],
  ["note", "note:book:intro", ".md", "book/intro.md"],
  ["note", "note:note:intro", ".md", "note/intro.md"],
  ["note", "note", ".md", "note.md"],
  ["note", "", ".md", "undefined.md"],
  ["note", ":intro:", ".md", "intro.md"],
  ["note", "::", ".md", "undefined.md"],
  ["book-section", "intro", ".md", "book-section/intro.md"],
  [
    "book-section",
    "book-1:part-1:chapter-2",
    ".md",
    "book-section/book-1/part-1/chapter-2.md",
  ],
  ["book-section", "book-section:intro", ".md", "book-section/intro.md"],
  [
    "book-section",
    "book-section:book-section:intro",
    ".md",
    "book-section/book-section/intro.md",
  ],
  ["book-section", "book-section", ".md", "book-section/book-section.md"],
  ["book-section", "", ".md", "book-section/undefined.md"],
  ["book-section", ":", ".md", "book-section/undefined.md"],
  ["book-section", ":book::intro:", ".md", "book-section/book/intro.md"],
  ["book-section", "book:::intro", ".md", "book-section/book/intro.md"],
  ["book-section", "book/intro", ".md", "book-section/book/intro.md"],
  ["book-section", "book//intro", ".md", "book-section/book/intro.md"],
  ["book-section", "book\\intro", ".md", "book-section/book\\intro.md"],
  ["book-section", "book:part/intro", ".md", "book-section/book/part/intro.md"],
  [
    "book-section",
    "book:part\\intro",
    ".md",
    "book-section/book/part\\intro.md",
  ],
  ["book-section", "book:.:intro", ".md", "book-section/book/intro.md"],
  ["book-section", "book:..:intro", ".md", "book-section/intro.md"],
  ["book-section", "../intro", ".md", "intro.md"],
  ["book-section", "..:..:intro", ".md", "../intro.md"],
  ["book-section", "/absolute:intro", ".md", "book-section/absolute/intro.md"],
  ["book-section", ".", ".md", "book-section/..md"],
  ["book-section", "..", ".md", "book-section/...md"],
  ["book-section", "intro.md", ".md", "book-section/intro.md.md"],
  [
    "book-section",
    "日本語:Cafe\u0301",
    ".md",
    "book-section/日本語/Cafe\u0301.md",
  ],
  ["book-section", "book: chapter ", ".md", "book-section/book/ chapter .md"],
  ["book-section", "bad\0name", ".md", "book-section/bad\0name.md"],
  ["site-content", "home:hero", ".md", "site-content/home/hero.md"],
  [
    "site-content",
    "site-content:home:hero",
    ".md",
    "site-content/home/hero.md",
  ],
  ["image", "gallery:cover", ".png", "image/gallery/cover.png"],
  ["image", "image:cover", ".webp", "image/cover.webp"],
  ["document", "book:chapter", ".pdf", "document/book/chapter.pdf"],
] as const;

describe("released entity placement golden", () => {
  test.each(placements)(
    "%s / %s (%s) keeps its exact relative path",
    (entityType, id, extension, expected) => {
      expect(
        relative(
          "/content",
          buildEntityFilePath("/content", id, entityType, extension),
        ),
      ).toBe(expected);
    },
  );

  test.each([
    ["intro.md", "note", "intro"],
    ["book-section/book/intro.md", "book-section", "book:intro"],
    ["book-section/book/intro:part.md", "book-section", "book:intro:part"],
    ["book-section/book/:intro.md", "book-section", "book::intro"],
    ["book-section/book/intro:.md", "book-section", "book:intro:"],
    ["book-section/book/:.md", "book-section", "book::"],
    ["book-section/book/intro.txt", "book-section", "book:intro.txt"],
    ["document/book/chapter.PDF", "document", "book:chapter"],
  ])("import of %s preserves the stored ID", (path, entityType, id) => {
    expect(parseEntityPath("/content", path)).toEqual({ entityType, id });
  });
});
