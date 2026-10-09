import { describe, expect, it } from "bun:test";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { parseGutenbergLetters } from "../src/adapters/gutenberg-letters";

async function briefwechsel(): Promise<string> {
  return readFile(
    join(import.meta.dir, "fixtures", "gutenberg-briefwechsel.html"),
    "utf8",
  );
}

const edition = {
  ebook: 64327,
  citation: "Briefwechsel I",
  writer: {
    signatures: ["K. M.", "K. Marx."],
    salutations: ["Lieber Engels!"],
  },
};

const part = "Erster Abschnitt. Die ersten Jahre des Bundes. 1844 bis 1849";

describe("parseGutenbergLetters", () => {
  it("reads the writer's letters under their part and year, each cited by its page", async () => {
    const units = parseGutenbergLetters(await briefwechsel(), edition);

    expect(
      units.map((unit) => [unit.parents, unit.title, unit.section]),
    ).toEqual([
      [[part, "1846"], "2. Brüssel, 15. Mai 1846.", "Briefwechsel I, 2"],
      [
        [part, "1846"],
        "3. 28 Deanstreet, Soho, Samstag, 13. September 1846.",
        "Briefwechsel I, 3",
      ],
    ]);
    expect(units[0]?.source).toBe(
      "https://www.gutenberg.org/cache/epub/64327/pg64327-images.html#page-2",
    );
  });

  it("reads a letter as printed, emphasis marked, fractions and tables written out", async () => {
    const units = parseGutenbergLetters(await briefwechsel(), edition);

    expect(units[0]?.paragraphs).toEqual([
      "Brüssel, 15. Mai 1846.",
      "Lieber Engels!",
      "Dem Seiler habe ich die 7 1/2 Schilling zukommen lassen. Er besitzt in a high degree das Talent, den Überschuß seiner Ausgaben zu liquidieren.",
      "Die Arbeiter protestieren als *Individuen* gegen die soziale Ordnung, statt als *Menschen*.",
      "a. Kapital | 14 500 000 £",
      "Dein K. M.",
    ]);
  });

  it("keeps an unsigned letter by its salutation, with a letter it quotes", async () => {
    const units = parseGutenbergLetters(await briefwechsel(), edition);

    expect(units[1]?.paragraphs).toEqual([
      "28 Deanstreet, Soho, Samstag, 13. September 1846.",
      "Lieber Engels!",
      "Ich schicke Dir einliegend den Brief von Schabelitz:",
      "„Lieber Marx!",
      "Die Broschüre ist gedruckt.",
      "Ihr J. Schabelitz.“",
      "[Ohne Unterschrift.]",
    ]);
  });

  it("leaves out the editors' text, their notes and Project Gutenberg's", async () => {
    const units = parseGutenbergLetters(await briefwechsel(), edition);
    const text = units
      .flatMap((unit) => [unit.title, ...unit.paragraphs])
      .join("\n");

    expect(text).not.toMatch(
      /Herausgeber|zurückgekehrt|Anschrift von|hohem Grade|Gutenberg|Section 1|\[1\]/,
    );
  });
});
