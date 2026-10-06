import { describe, expect, it } from "bun:test";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { parseEkgwbBook } from "../src/adapters/ekgwb";

async function fixture(name: string): Promise<string> {
  return readFile(join(import.meta.dir, "fixtures", name), "utf8");
}

describe("parseEkgwbBook", () => {
  it("reads the book title and one unit per siglum block", async () => {
    const book = parseEkgwbBook(await fixture("ekgwb-flat.html"));

    expect(book.title).toBe("Erfundenes Buch");
    expect(book.units.map((unit) => unit.section)).toEqual([
      "EB-Vorwort",
      "EB-1",
    ]);
    expect(book.units.map((unit) => unit.title)).toEqual(["Vorwort", "1"]);
    expect(book.units[1]?.source).toBe(
      "http://www.nietzschesource.org/eKGWB/EB-1",
    );
  });

  it("keeps the author's text: emphasis, corrections, whitespace normalised", async () => {
    const [vorwort, first] = parseEkgwbBook(
      await fixture("ekgwb-flat.html"),
    ).units;

    expect(vorwort?.paragraphs).toEqual(["Erster erfundener Absatz."]);
    expect(first?.paragraphs).toEqual([
      "Ein *gesperrtes* Wort.",
      "Ein berichtigtes Wort.",
      "Zentrierter Satz.",
    ]);
  });

  it("leaves out editors' notes and footnotes", async () => {
    const text = parseEkgwbBook(await fixture("ekgwb-flat.html"))
      .units.flatMap((unit) => unit.paragraphs)
      .join("\n");

    expect(text).not.toContain("Anmerkung");
    expect(text).not.toContain("Lesart");
    expect(text).not.toContain("Korrekturen");
  });

  it("keeps verse: stanzas as paragraphs, lines as hard breaks", async () => {
    const book = parseEkgwbBook(await fixture("ekgwb-verse.html"));

    expect(book.units.map((unit) => unit.section)).toEqual([
      "VB-Lied",
      "VB-Geschachtelt",
    ]);
    expect(book.units[0]?.paragraphs).toEqual([
      "Erste erfundene Zeile,  \nzweite *erfundene* Zeile.",
      "Dritte Zeile  \nund vierte.",
    ]);
    expect(book.units[1]?.paragraphs).toEqual([
      "Innen eins  \ninnen zwei  \nNoch eine Zeile  \n*Ausruf*",
    ]);
  });

  it("reads line breaks as spaces in titles, headings and prose", async () => {
    const book = parseEkgwbBook(await fixture("ekgwb-breaks.html"));

    expect(book.title).toBe("Ueber erfundene Dinge");
    expect(book.units[0]?.title).toBe("Erstes Stück");
    expect(book.units[0]?.paragraphs).toEqual(["Ein Satz, der weitergeht."]);
  });

  it("files sections under their parts", async () => {
    const book = parseEkgwbBook(await fixture("ekgwb-parts.html"));

    expect(
      book.units.map((unit) => [unit.parents, unit.title, unit.section]),
    ).toEqual([
      [["Erster Theil"], "Vom Anfang", "TB-I-1"],
      [["Erster Theil"], "Vom Weg", "TB-I-2"],
      [["Zweiter Theil"], "Vom Ende", "TB-II-1"],
    ]);
  });
});
