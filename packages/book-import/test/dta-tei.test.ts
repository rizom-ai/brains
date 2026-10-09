import { describe, expect, it } from "bun:test";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { parseDtaTei } from "../src/adapters/dta-tei";

async function kapital(): Promise<string> {
  return readFile(join(import.meta.dir, "fixtures", "dta-kapital.xml"), "utf8");
}

const work = {
  id: "marx_kapital01_1867",
  citation: "Kapital I",
  title: "Das Kapital. Erster Band",
};

describe("parseDtaTei", () => {
  it("reads the body's sections under their headings, each cited by work and page", async () => {
    const { units } = parseDtaTei(await kapital(), work);

    expect(
      units.map((unit) => [unit.parents, unit.title, unit.section]),
    ).toEqual([
      [["Erstes Kapitel. Waare und Geld."], "1. Die Waare.", "Kapital I, 1"],
      [
        ["Erstes Kapitel. Waare und Geld."],
        "2. Doppelcharakter der in den Waaren dargestellten Arbeit.",
        "Kapital I, 2",
      ],
    ]);
    expect(units[0]?.source).toBe(
      "https://www.deutschestextarchiv.de/book/view/marx_kapital01_1867?p=11",
    );
  });

  it("joins words broken at the line's end, marks emphasis, and writes formulas out", async () => {
    const { units } = parseDtaTei(await kapital(), work);

    expect(units[0]?.paragraphs.slice(0, 3)).toEqual([
      "Der Reichthum der Gesellschaften, in welchen kapitalistische Produktionsweise herrscht, erscheint als eine „ungeheure Waarensammlung“1), die *einzelne* Waare als seine Elementarform.",
      "Die Waare ist zunächst ein äusserer Gegenstand, ein Ding, das auf 1/39 seines Einkommens2) verzichtet.",
      "Die Nützlichkeit eines Dings macht es zum Gebrauchswerth.",
    ]);
  });

  it("keeps the author's notes after the text, a note continued on the next page whole", async () => {
    const { units } = parseDtaTei(await kapital(), work);

    expect(units[0]?.paragraphs.slice(3)).toEqual([
      "1) *Karl Marx*: Zur Kritik der Politischen Oekonomie. Berlin 1859, p. 4.",
      "2) „Der Begriff, welcher zunächst nur subjektiv ist, schreitet fort.“",
    ]);
  });

  it("leaves out the title page, the printer's signatures and the back matter", async () => {
    const { units } = parseDtaTei(await kapital(), work);
    const text = units.flatMap((unit) => unit.paragraphs).join("\n");

    expect(text).not.toContain("Marx, Kapital I. 1");
    expect(text).not.toContain("Werke von Karl Marx");
  });

  it("reads the transcription's licence", async () => {
    expect(parseDtaTei(await kapital(), work).licence).toBe(
      "https://creativecommons.org/licenses/by-sa/4.0/deed.de",
    );
  });
});
