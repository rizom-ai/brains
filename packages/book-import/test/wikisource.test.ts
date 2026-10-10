import { describe, expect, it } from "bun:test";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { parseWikisourcePage } from "../src/adapters/wikisource";

async function briefwechsel(): Promise<string> {
  return readFile(
    join(import.meta.dir, "fixtures", "wikisource-briefwechsel.html"),
    "utf8",
  );
}

const work = {
  page: "Ein Briefwechsel von 1843",
  citation: "Briefwechsel",
  skipHeadings: ["R. an M."],
};

describe("parseWikisourcePage", () => {
  it("reads each centred heading as a section, cited by work and printed page", async () => {
    const units = parseWikisourcePage(await briefwechsel(), work);

    expect(
      units.map((unit) => [unit.parents, unit.title, unit.section]),
    ).toEqual([
      [[], "I. Die Briefe.", "Briefwechsel, 17"],
      [[], "M. an R.", "Briefwechsel, 17"],
      [[], "M. an R.", "Briefwechsel, 18"],
    ]);
    expect(units[1]?.source).toBe(
      "https://de.wikisource.org/wiki/Ein_Briefwechsel_von_1843#Seite_17",
    );
  });

  it("reads paragraphs as printed, emphasis marked, Wikisource's own notes left out", async () => {
    const units = parseWikisourcePage(await briefwechsel(), work);

    expect(units[1]?.paragraphs).toEqual([
      "Auf Treckschuit nach D. im Mærz 1843.",
      "Ich reise jetzt in Holland. Deutschland ist tief in den Dreck hineingeritten, und ich versichere Sie, man fühlt doch *Nationalscham*, sogar in Holland.",
      "Das ist auch eine Offenbarung, wenn gleich eine *umgekehrte*. Die Scham ist schon eine Revolution; der Staat ist ein zu ernstes Ding.",
    ]);
    expect(units[2]?.paragraphs).toEqual([
      "Kœln, im Mai 1843.",
      "Ihr Brief, mein theurer Freund, ist eine gute Elegie.",
    ]);
  });

  it("cases a heading set in capitals, and marks nested emphasis once", () => {
    const units = parseWikisourcePage(
      `<span class="PageNumber" id="Seite_182">[182]</span><div style="text-align:center"><big><b>ZUR JUDENFRAGE.</b></big></div><p>1) <i><span style="letter-spacing:0.2em">Bruno Bauer: Die Judenfrage.</span> Braunschweig 1843.</i></p>`,
      { page: "Zur Judenfrage", citation: "Judenfrage" },
    );

    expect(units.map((unit) => [unit.title, unit.section])).toEqual([
      ["Zur Judenfrage.", "Judenfrage, 182"],
    ]);
    // Spaced type within italics is one emphasis.
    expect(units[0]?.paragraphs).toEqual([
      "1) *Bruno Bauer: Die Judenfrage. Braunschweig 1843.*",
    ]);
  });

  it("leaves out the byline, the text data and a section the work names", async () => {
    const units = parseWikisourcePage(await briefwechsel(), work);
    const text = units.flatMap((unit) => [unit.title, ...unit.paragraphs]);

    expect(text.join("\n")).not.toMatch(/KARL MARX|Autor|besseres Lied|WS 1/);
  });
});
