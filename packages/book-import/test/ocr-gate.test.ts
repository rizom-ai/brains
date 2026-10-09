import { describe, expect, it } from "bun:test";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { pageLeaf, pageText } from "../src/adapters/archive-ocr";
import { samplePages } from "../src/ocr-gate";

describe("samplePages", () => {
  const ranges = [
    { firstPage: 1, lastPage: 40, skipPages: [5] },
    { firstPage: 51, lastPage: 60, skipPages: [] },
  ];

  it("draws the same pages for the same volume, all inside its works", () => {
    const first = samplePages("freud-1940-gw-9", ranges, 20);
    const again = samplePages("freud-1940-gw-9", ranges, 20);

    expect(first).toEqual(again);
    expect(first).toHaveLength(20);
    expect(new Set(first).size).toBe(20);
    expect(
      first.every(
        (page) =>
          page !== 5 &&
          ((page >= 1 && page <= 40) || (page >= 51 && page <= 60)),
      ),
    ).toBe(true);
    expect(first).toEqual([...first].sort((a, b) => a - b));
  });

  it("draws every page of a volume shorter than the sample", () => {
    expect(
      samplePages("x", [{ firstPage: 3, lastPage: 6, skipPages: [] }], 20),
    ).toEqual([3, 4, 5, 6]);
  });
});

describe("pageLeaf", () => {
  it("finds the scan leaf a printed page is on", async () => {
    const hocr = await readFile(
      join(import.meta.dir, "fixtures", "archive-ocr-gw.html"),
      "utf8",
    );

    expect(pageLeaf(hocr, 4)).toBe(13);
  });
});

describe("pageText", () => {
  it("gives one printed page as the importer reads it, notes after the text", async () => {
    const hocr = await readFile(
      join(import.meta.dir, "fixtures", "archive-ocr-gw.html"),
      "utf8",
    );

    expect(pageText(hocr, 4)).toBe(
      [
        "historisch festgelegten System angenähert haben.¹) Wir gelangen",
        "zu solchen Annahmen bei dem Bemühen, von den Tatsachen einer-",
        ".seits Beschreibung und Rechenschaft zu geben.",
        "¹) Vgl. Zur Psychoanalyse der Kriegsneurosen. Mit Beiträgen von",
        "Ferenczi, Abraham, Simmel und E. Jones, 1919.",
      ].join("\n"),
    );
  });
});
