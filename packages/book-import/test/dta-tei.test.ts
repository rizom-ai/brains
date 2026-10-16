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
      [[], "Widmung", "Kapital I, III"],
      [[], "Vorwort.", "Kapital I, VII"],
      [["Erstes Kapitel. Waare und Geld."], "1. Die Waare.", "Kapital I, 1"],
      [
        ["Erstes Kapitel. Waare und Geld."],
        "2. Doppelcharakter der in den Waaren dargestellten Arbeit.",
        "Kapital I, 2",
      ],
    ]);
    expect(units[2]?.source).toBe(
      "https://www.deutschestextarchiv.de/book/view/marx_kapital01_1867?p=11",
    );
    expect(units[1]?.paragraphs).toEqual([
      "Das Werk, dessen ersten Band ich dem Publikum übergebe, ist die Fortsetzung meiner Schrift.",
    ]);
  });

  it("keeps a note in a heading as the section's note, its marker out of the title", async () => {
    const { units } = parseDtaTei(await kapital(), work);

    expect(units[3]?.paragraphs).toEqual([
      "Ursprünglich erschien uns die Waare als ein Zwieschlächtiges.",
      "3) Zuerst entwickelt in der Kritik.",
    ]);
  });

  it("joins words broken at the line's end, marks emphasis, and writes formulas out", async () => {
    const { units } = parseDtaTei(await kapital(), work);

    expect(units[2]?.paragraphs.slice(0, 3)).toEqual([
      "Der Reichthum der Gesellschaften, in welchen kapitalistische Produktionsweise herrscht, erscheint als eine „ungeheure Waarensammlung“1), die *einzelne* Waare als seine Elementarform.",
      "Die Waare ist zunächst ein äusserer Gegenstand, ein Ding, das auf 1/39 seines Einkommens2) verzichtet.",
      "Die Nützlichkeit eines Dings macht es zum Gebrauchswerth.",
    ]);
  });

  it("reads Fraktur's letterforms and hyphens as today's, keeping a compound's hyphen", () => {
    const xml = `<TEI><text><body><pb n="1" facs="#f0001"/>
<div><head>I.</head><p>Die ſogenannten bürger¬<lb/>lichen Freiheiten, die Eigenthums-<lb/>Verhältniſſe, Barrot¬<lb/>Faucher ꝛc. ꝛc.</p>
<p>Die <hi rendition="#g">objek</hi>¬<lb/><hi rendition="#g">tiven</hi> Ge¬<lb/>schichtschreiber und ihre <hi rendition="#g">Privat</hi>-<lb/>arbeiten.</p>
<p>Im alten Rom Silber-<lb/>und Goldmünzen, <hi rendition="#g">Hände</hi>-<lb/>oder Kopfarbeit.</p>
<p><hi rendition="#g">Erster <hi rendition="#i">Fall</hi>:</hi> 4000<hi rendition="#i">c</hi>.</p>
<p>Die Herren <hi rendition="#g">V</hi><hi rendition="#aq">é</hi><hi rendition="#g">ron</hi>-<hi rendition="#g">Crevel</hi><note place="foot" n="**)"><hi rendition="#g">Th. Hobbes</hi><hi rendition="#i">:</hi> Leviathan.</note>.</p></div>
</body></text></TEI>`;
    const { units } = parseDtaTei(xml, {
      id: "marx_bonaparte_1869",
      citation: "Brumaire",
      title: "Der achtzehnte Brumaire des Louis Bonaparte",
    });

    expect(units[0]?.paragraphs).toEqual([
      "Die sogenannten bürgerlichen Freiheiten, die Eigenthums-Verhältnisse, Barrot-Faucher etc. etc.",
      "Die *objektiven* Geschichtschreiber und ihre *Privat*arbeiten.",
      "Im alten Rom Silber- und Goldmünzen, *Hände*- oder Kopfarbeit.",
      "*Erster Fall:* 4000*c*.",
      "Die Herren *Véron*-*Crevel*\\*\\*).",
      "\\*\\*) *Th. Hobbes:* Leviathan.",
    ]);
  });

  it("keeps the author's notes after the text, a note continued on the next page whole", async () => {
    const { units } = parseDtaTei(await kapital(), work);

    expect(units[2]?.paragraphs.slice(3)).toEqual([
      "1) *Karl Marx*: Zur Kritik der Politischen Oekonomie. Berlin 1859, p. 4.",
      "2) „Der Begriff, welcher zunächst nur subjektiv ist, schreitet fort.“",
    ]);
  });

  it("titles the text under the work's own heading by it, without making it the parent of the rest", () => {
    const xml = `<TEI><text><body><pb n="3" facs="#f0003"/>
<div><head>Manifest<lb/>der Kommunistischen Partei.</head>
<p>Ein Gespenst geht um in Europa.</p>
<div><head>I.<lb/>Bourgeois und Proletarier.</head><p>Die Geschichte aller bisherigen Gesellschaft.</p></div>
</div></body></text></TEI>`;
    const { units } = parseDtaTei(xml, {
      id: "marx_manifestws_1848",
      citation: "Manifest",
      title: "Manifest der Kommunistischen Partei",
    });

    expect(units.map((unit) => [unit.parents, unit.title])).toEqual([
      [[], "Manifest der Kommunistischen Partei."],
      [[], "I. Bourgeois und Proletarier."],
    ]);
  });

  it("leaves out a division the work names, with all it holds", async () => {
    const { units } = parseDtaTei(await kapital(), {
      ...work,
      skipHeadings: ["Vorwort", "Erstes Kapitel. Waare und Geld"],
    });

    expect(units.map((unit) => unit.title)).toEqual(["Widmung"]);
  });

  it("leaves out the title page, the table of contents, the printer's signatures and the back matter", async () => {
    const { units } = parseDtaTei(await kapital(), work);
    const text = units.flatMap((unit) => unit.paragraphs).join("\n");

    expect(text).not.toContain("Marx, Kapital I. 1");
    expect(text).not.toContain("Werke von Karl Marx");
    expect(text).not.toContain("Vorwort. VII");
  });

  it("reads a header holding character data, and its licence", async () => {
    expect(parseDtaTei(await kapital(), work).licence).toBe(
      "https://creativecommons.org/licenses/by-sa/4.0/deed.de",
    );
  });
});
