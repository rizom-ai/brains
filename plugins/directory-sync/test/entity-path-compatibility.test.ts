import { describe, expect, test } from "bun:test";
import { decodeEntityIdPath, encodeEntityIdPath } from "@brains/entity-service";
import { buildEntityFilePath, parseEntityPath } from "../src/lib/entity-paths";

// Historical diagnostic paths, not approval of unsafe IDs. Type prefixes now
// remain literal (owner decision); invalid IDs are refused at filesystem effects.
describe("existing directory-sync path compatibility", () => {
  test.each([
    ["note", "intro", "/sync/intro.md", "note", "intro"],
    ["note", "book:intro", "/sync/book/intro.md", "book", "intro"],
    ["note", "note:intro", "/sync/note/intro.md", "note", "intro"],
    [
      "book-section",
      "book:intro",
      "/sync/book-section/book/intro.md",
      "book-section",
      "book:intro",
    ],
    [
      "book-section",
      "book-section:intro",
      "/sync/book-section/book-section/intro.md",
      "book-section",
      "book-section:intro",
    ],
    [
      "book-section",
      "book-section:book-section:intro",
      "/sync/book-section/book-section/book-section/intro.md",
      "book-section",
      "book-section:book-section:intro",
    ],
    [
      "book-section",
      ":book::intro:",
      "/sync/book-section/book/intro.md",
      "book-section",
      "book:intro",
    ],
    [
      "book-section",
      "",
      "/sync/book-section/undefined.md",
      "book-section",
      "undefined",
    ],
    [
      "book-section",
      "book/intro",
      "/sync/book-section/book/intro.md",
      "book-section",
      "book:intro",
    ],
    [
      "book-section",
      "book\\intro",
      "/sync/book-section/book\\intro.md",
      "book-section",
      "book\\intro",
    ],
    [
      "book-section",
      "book:.:intro",
      "/sync/book-section/book/intro.md",
      "book-section",
      "book:intro",
    ],
    [
      "book-section",
      "book:..:intro",
      "/sync/book-section/intro.md",
      "book-section",
      "intro",
    ],
    [
      "book-section",
      "日本語:Cafe\u0301",
      "/sync/book-section/日本語/Cafe\u0301.md",
      "book-section",
      "日本語:Cafe\u0301",
    ],
    [
      "book-section",
      "intro.md",
      "/sync/book-section/intro.md.md",
      "book-section",
      "intro.md",
    ],
  ])(
    "pins %s ID %s",
    (entityType, entityId, filePath, importedType, importedId) => {
      expect(buildEntityFilePath("/sync", entityId, entityType)).toBe(filePath);
      expect(parseEntityPath("/sync", filePath)).toEqual({
        entityType: importedType,
        id: importedId,
      });
    },
  );

  test.each([".md", ".MD", ".png", ".jpeg", ".pdf", ".PDF"])(
    "strips recognized extension %s",
    (extension) => {
      expect(
        parseEntityPath("/sync", `book-section/intro${extension}`),
      ).toEqual({
        entityType: "book-section",
        id: "intro",
      });
    },
  );

  test("retains unrecognized extensions and literal colons on import", () => {
    expect(parseEntityPath("/sync", "book-section/intro.txt").id).toBe(
      "intro.txt",
    );
    expect(parseEntityPath("/sync", "book-section/intro:part.md").id).toBe(
      "intro:part",
    );
    // Export interprets the colon as hierarchy, unlike the imported filename.
    expect(buildEntityFilePath("/sync", "intro:part", "book-section")).toBe(
      "/sync/book-section/intro/part.md",
    );
  });

  test("round-trips the supported structured book example without migration", () => {
    const segments = ["book-1", "part-1", "chapter-2"] as const;
    const id = encodeEntityIdPath(segments);
    const path = buildEntityFilePath("/sync", id, "book-section");
    expect(path).toBe("/sync/book-section/book-1/part-1/chapter-2.md");
    const imported = parseEntityPath("/sync", path);
    expect(imported).toEqual({ entityType: "book-section", id });
    expect(decodeEntityIdPath(imported.id)).toEqual([...segments]);
  });
});
