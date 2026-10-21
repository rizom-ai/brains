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

  it("finds parts the page marks by siglum and by a leading heading", async () => {
    const book = parseEkgwbBook(await fixture("ekgwb-implicit-parts.html"));

    expect(
      book.units.map((unit) => [unit.section, unit.parents, unit.title]),
    ).toEqual([
      ["IB-[Titel]", [], "Titel"],
      ["IB-[Motto]", [], "IB-[Motto]"],
      ["IB-Vorrede-1", ["Vorrede"], "1"],
      ["IB-Vorrede-2", ["Vorrede"], "2"],
      ["IB-1", ["Erstes Hauptstück"], "1"],
      ["IB-2", ["Erstes Hauptstück"], "2"],
      ["IB-II-[Motto]", ["Zweites Buch"], "Motto"],
      ["IB-II-3", ["Zweites Buch"], "3"],
      ["IB-III-4", ["Drittes Buch"], "4"],
    ]);
  });

  it("files under a part only what the page prints as one", async () => {
    const book = parseEkgwbBook(
      await fixture("ekgwb-part-anomalies.html"),
      "XB",
    );

    expect(
      book.units.map((unit) => [unit.section, unit.parents, unit.title]),
    ).toEqual([
      ["XB-[Titel]", [], "Titel"],
      // A siglum segment that is no numeral is no heading: 1878, Vogel.
      ["XB-1878-[Widmung]", [], "XB-1878-[Widmung]"],
      ["XB-1878-Vorrede", [], "An Stelle einer Vorrede"],
      ["XB-Vorrede", ["Vorrede, zu lesen vorher"], "1"],
      // A titled block at the book's own level is not in the part before it.
      ["XB-I", [], "Vortrag I"],
      // The first numbered section's heading names its chapter; the
      // siglum's spelling (ue for ü) does not split it.
      ["XB-Irrthuemer-1", ["Die vier grossen Irrthümer"], "1"],
      ["XB-Irrthümer-2", ["Die vier grossen Irrthümer"], "2"],
      // A bracketed copy of the heading continues its chapter.
      ["XB-Gefahr-1", ["Wagner als Gefahr"], "1"],
      ["XB-Gefahr-2", ["Wagner als Gefahr"], "2"],
      // A heading-only block names the part its siglum opens.
      ["XB-Kritik-1", ["Versuch einer Kritik"], "1"],
      ["XB-AB-1", ["Vermischte Meinungen"], "1"],
      // A part opened above a titled block goes on through titled blocks.
      ["XB-Reden", ["Die Reden"], "Von den Verwandlungen"],
      ["XB-Tugend", ["Die Reden"], "Von der Tugend"],
      ["XB-Vogel-Urtheil", [], "Vogel-Urtheil"],
    ]);
  });

  it("keeps emphasis to its words: touching spans merge, markdown characters escape", async () => {
    const [unit] = parseEkgwbBook(await fixture("ekgwb-emphasis.html")).units;

    expect(unit?.paragraphs).toEqual([
      "Ein *gespro*\\<*chenes*\\> Wort, dann *zusammen* und ein Stern \\* hier.",
      // An editor's correction wraps a word; it still touches its neighbour.
      "Wie in einem *gleichnissartigen Traumbilde*, sichtbar.",
      // Space at a span's edge stays outside the emphasis.
      "Das *„Übermass*“ endet *hier* und dort.",
    ]);
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
