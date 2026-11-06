import { describe, expect, it } from "bun:test";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { pageLeaf, pageText } from "../src/adapters/archive-ocr";
import { samplePages } from "../src/ocr-gate";

describe("samplePages", () => {
  const pages: Array<number | string> = [
    ...Array.from({ length: 40 }, (_, index) => index + 1).filter(
      (page) => page !== 5,
    ),
    ...Array.from({ length: 10 }, (_, index) => index + 51),
  ];

  it("draws the same pages for the same volume, all among its works', in their order", () => {
    const first = samplePages("freud-1940-gw-9", pages, 20);
    const again = samplePages("freud-1940-gw-9", pages, 20);

    expect(first).toEqual(again);
    expect(first).toHaveLength(20);
    expect(new Set(first).size).toBe(20);
    expect(first.every((page) => pages.includes(page))).toBe(true);
    expect(first).toEqual(
      [...first].sort((a, b) => pages.indexOf(a) - pages.indexOf(b)),
    );
  });

  it("draws every page of a volume shorter than the sample, front matter included", () => {
    expect(samplePages("x", ["V", "VI", 1, 2], 20)).toEqual(["V", "VI", 1, 2]);
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
