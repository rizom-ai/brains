import { describe, expect, it } from "bun:test";
import { type Citation, unitsOfSections } from "../src/sections";

describe("unitsOfSections", () => {
  const cite = (start: { page: number }): Citation => ({
    citation: `S. ${start.page}`,
    source: `https://example.org/${start.page}`,
  });

  it("keeps a note's paragraphs that run on to the next pages with the note, in the part its mark is in", () => {
    const units = unitsOfSections(
      [
        {
          path: [],
          titles: [],
          paragraphs: [
            { text: "Text auf Seite 31.¹)", page: 31 },
            { text: "Text auf Seite 32.", page: 32 },
          ],
          notes: [
            { text: "¹) Voici la résolution de la Conférence :", page: 31 },
            { text: "Vu la Résolution du Congrès de Lausanne ;", page: 32 },
            { text: "²) Une autre note.", page: 32 },
          ],
        },
      ],
      cite,
      20,
      (note) => !/^[¹²]\)/u.test(note.text),
    );

    expect(units.map((unit) => unit.paragraphs)).toEqual([
      [
        "Text auf Seite 31.¹)",
        "¹) Voici la résolution de la Conférence :",
        "Vu la Résolution du Congrès de Lausanne ;",
      ],
      ["Text auf Seite 32.", "²) Une autre note."],
    ]);
  });

  it("places every note by its page where the reader names no note as running on", () => {
    const units = unitsOfSections(
      [
        {
          path: [],
          titles: [],
          paragraphs: [
            { text: "Text auf Seite 31.", page: 31 },
            { text: "Text auf Seite 32.", page: 32 },
          ],
          notes: [
            { text: "Eine Note ohne Zeichen.", page: 31 },
            { text: "Eine zweite Note ohne Zeichen.", page: 32 },
          ],
        },
      ],
      cite,
      20,
    );

    expect(units.map((unit) => unit.paragraphs)).toEqual([
      ["Text auf Seite 31.", "Eine Note ohne Zeichen."],
      ["Text auf Seite 32.", "Eine zweite Note ohne Zeichen."],
    ]);
  });
});
