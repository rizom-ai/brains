import { describe, expect, test } from "bun:test";
import { relative } from "node:path";
import {
  buildEntityFilePath,
  parseEntityPath,
  resolveEntityPlacement,
} from "../src/lib/entity-paths";

// Captured against the released implementation BEFORE codec adoption.
// These are placement observations, not validation rules or approval of unsafe IDs.
// Owner decision: remove type-prefix stripping to make valid IDs injective.
// Only the seven type-prefixed rows below change their diagnostic placement.
// Nested notes remain readable here but are refused by the filesystem guard;
// this inventory describes paths, not permission to write historical IDs.
const placements = [
  ["note", "intro", ".md", "intro.md"],
  ["note", "note:intro", ".md", "note/intro.md"],
  ["note", "book:intro", ".md", "book/intro.md"],
  ["note", "note:book:intro", ".md", "note/book/intro.md"],
  ["note", "note:note:intro", ".md", "note/note/intro.md"],
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
  [
    "book-section",
    "book-section:intro",
    ".md",
    "book-section/book-section/intro.md",
  ],
  [
    "book-section",
    "book-section:book-section:intro",
    ".md",
    "book-section/book-section/book-section/intro.md",
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
    "site-content/site-content/home/hero.md",
  ],
  ["image", "gallery:cover", ".png", "image/gallery/cover.png"],
  ["image", "image:cover", ".webp", "image/image/cover.webp"],
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

  // A path in the table above only describes where an ID *would* land; it is
  // not permission to write there. This column states, per row and in the same
  // order, whether the ID is exportable at all, so the inventory carries the
  // rule rather than implying that every diagnostic path is a destination.
  // Positional rather than keyed by ID: two IDs can differ only by Unicode
  // normalization and must still be judged as separate rows.
  const exportable = [
    true, //  note / intro
    false, // note / note:intro                — nested note
    false, // note / book:intro                — nested note
    false, // note / note:book:intro           — nested note
    false, // note / note:note:intro           — nested note
    true, //  note / note
    false, // note / ""                        — empty segment
    false, // note / :intro:                   — empty segments, nested
    false, // note / ::                        — empty segments, nested
    true, //  book-section / intro
    true, //  book-section / book-1:part-1:chapter-2
    true, //  book-section / book-section:intro
    true, //  book-section / book-section:book-section:intro
    true, //  book-section / book-section
    false, // book-section / ""                — empty segment
    false, // book-section / :                 — empty segments
    false, // book-section / :book::intro:     — empty segments
    false, // book-section / book:::intro      — empty segments
    false, // book-section / book/intro        — separator inside a segment
    false, // book-section / book//intro       — separator inside a segment
    false, // book-section / book\intro        — separator inside a segment
    false, // book-section / book:part/intro   — separator inside a segment
    false, // book-section / book:part\intro   — separator inside a segment
    false, // book-section / book:.:intro      — dot segment
    false, // book-section / book:..:intro     — dot segment
    false, // book-section / ../intro          — escapes the sync root
    false, // book-section / ..:..:intro       — escapes the sync root
    false, // book-section / /absolute:intro   — separator inside a segment
    false, // book-section / .                 — dot segment
    false, // book-section / ..                — dot segment
    true, //  book-section / intro.md          — a period is not a separator
    true, //  book-section / <decomposed Café> — round-trips byte for byte
    true, //  book-section / "book: chapter "  — spaces are ordinary characters
    false, // book-section / bad\0name         — NUL byte
    true, //  site-content / home:hero
    true, //  site-content / site-content:home:hero
    true, //  image / gallery:cover
    true, //  image / image:cover
    true, //  document / book:chapter
  ];

  test("the writability column covers every placement row", () => {
    expect(exportable).toHaveLength(placements.length);
  });

  function writabilityCase(
    row: (typeof placements)[number],
    index: number,
  ): [string, string, string, boolean] {
    const [entityType, id, extension] = row;
    // A missing column entry would silently read as "refused"; the length test
    // above is what keeps this fallback unreachable.
    return [entityType, id, extension, exportable[index] ?? false];
  }

  test.each(placements.map(writabilityCase))(
    "%s / %s (%s) exports only when its path reads back as itself",
    (entityType, id, extension, writable) => {
      expect(
        resolveEntityPlacement("/content", entityType, id, extension).writable,
      ).toBe(writable);
    },
  );

  test("every nested note is refused, whatever path it describes", () => {
    for (const [entityType, id] of placements) {
      if (entityType !== "note" || !id.includes(":")) continue;
      expect(
        resolveEntityPlacement("/content", entityType, id, ".md").writable,
      ).toBe(false);
    }
  });

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
