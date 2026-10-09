import { describe, expect, it } from "bun:test";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import {
  languageOf,
  megaLetterUnits,
  parseMegaLetter,
} from "../src/adapters/mega-letters";

async function fixture(name: string): Promise<string> {
  return readFile(join(import.meta.dir, "fixtures", name), "utf8");
}

describe("parseMegaLetter", () => {
  it("reads a letter as written: dateline, salutation, text and signature", async () => {
    const letter = parseMegaLetter(await fixture("mega-letter-de.xml"));

    expect(letter.paragraphs).toEqual([
      "20 Juli. 1867.",
      "Lieber Freiligrath,",
      "Ich lese deutschen belletristischen Schund nicht, kann aber nicht vermeiden, daß hier u. da Freunde aus Dtschd mir Personalia enthaltende Auszüge zuschicken. So erhielt ich gestern alle auf mich bezüglichen Passus aus der Schrift eines gewissen Rasch, benamset: „Zwölf Streiter der Revolution“. Ich ersuche Dich mir über folgende Stelle Aufschluß zu geben:",
      "„F’s Beziehungen zu Marx hatten etc gänzlich aufgehört; *eine gar nicht zu entschuldigende Handlung Marxens,* welche ich hier verschweigen will hatte ihnen den lezten Stoß gegeben. Sie ist nur aus der Gehässigkeit eines Charakters wie Marx zu erklären. Als ich eines Tages, empört über dieselbe, F. nach den *Details* derselben fragte, überging er sie schonend.“",
      "D KM.",
    ]);
  });

  it("reads the letter's date, language and licence", async () => {
    const german = parseMegaLetter(await fixture("mega-letter-de.xml"));
    const english = parseMegaLetter(await fixture("mega-letter-en.xml"));

    expect([german.date, german.language, german.licence]).toEqual([
      "1867-07-20",
      "de",
      "https://creativecommons.org/licenses/by-sa/4.0/",
    ]);
    expect([english.date, english.language]).toEqual(["1866-09-26", "en"]);
  });

  it("leaves out the editors' notes and what the writer struck out", async () => {
    const english = parseMegaLetter(await fixture("mega-letter-en.xml"));
    const text = english.paragraphs.join("\n");

    expect(text).not.toContain("Marx beantwortet");
    expect(text).not.toContain("rember");
  });
});

describe("parseMegaLetter, the editors' additions", () => {
  it("reads what the editors supply as part of the word, a gap as one", () => {
    const letter = parseMegaLetter(
      `<TEI xmlns="http://www.tei-c.org/ns/1.0"><text><body><div><p>Es war ausser<supplied>dem</supplied> nicht er<supplied>’</supplied>s Schuld, <gap/> und so weiter.</p></div></body></text></TEI>`,
    );

    expect(letter.paragraphs).toEqual([
      "Es war ausserdem nicht er’s Schuld, […] und so weiter.",
    ]);
  });
});

describe("languageOf", () => {
  it("tells German, English and French apart by their common words", () => {
    expect(
      languageOf("Ich weiß nicht, ob das der Fall ist und wie es kam."),
    ).toBe("de");
    expect(
      languageOf("I do not know whether that is the case and how it came."),
    ).toBe("en");
    expect(
      languageOf("Je ne sais pas si c'est le cas et comment il est venu."),
    ).toBe("fr");
  });
});

describe("megaLetterUnits", () => {
  it("files each letter under its year, titled by its heading, linked to MEGAdigital", async () => {
    const units = megaLetterUnits(
      [
        {
          id: "M0000300",
          heading:
            "Karl Marx an Ferdinand Freiligrath in London. London, Samstag, 20. Juli 1867",
          letter: parseMegaLetter(await fixture("mega-letter-de.xml")),
        },
      ],
      "Karl Marx",
    );

    expect(
      units.map((unit) => [
        unit.parents,
        unit.title,
        unit.section,
        unit.source,
      ]),
    ).toEqual([
      [
        ["1867"],
        "An Ferdinand Freiligrath in London. London, Samstag, 20. Juli 1867",
        "An Ferdinand Freiligrath in London. London, Samstag, 20. Juli 1867",
        "https://megadigital.bbaw.de/briefe/detail.xql?id=M0000300",
      ],
    ]);
  });
});
