import { describe, expect, it } from "bun:test";
import {
  createSpelling,
  headingLineOf,
  headingOf,
  isWordy,
} from "../src/adapters/archive-ocr-headings";

describe("createSpelling", () => {
  it("cases each word as the text spells it, and keeps an initial a capital", () => {
    const { cased } = createSpelling([
      "Die Kranke war dreißig Jahre alt, als Miss Lucy kam.",
      // The OCR leaves single small letters about the page.
      "r u r",
    ]);

    expect(cased("MISS LUCY R., DREISSIG JAHRE")).toBe(
      "Miss Lucy R., dreißig Jahre",
    );
  });
});

describe("createSpelling after an apostrophe", () => {
  it("keeps a possessive s small", () => {
    const { cased } = createSpelling([
      "Le Bon schildert die Masse, wie Le Bon es sieht.",
    ]);

    expect(cased("LE BON’S SCHILDERUNG")).toBe("Le Bon’s Schilderung");
  });
});

describe("headingLineOf", () => {
  it("reads a numbered chapter however it names itself", () => {
    expect(headingLineOf("1. KAPITEL", 80)?.kind).toBe("chapter");
    expect(headingLineOf("IX. VORLESUNG", 80)?.kind).toBe("chapter");
  });
});

describe("headingLineOf on a section's name", () => {
  it("reads a preface's or a closing section's name as a heading, however set", () => {
    expect(headingLineOf("Vorwort.", 50)).toEqual({
      kind: "caps",
      text: "Vorwort.",
      size: 50,
    });
    expect(headingLineOf("Nachtrag", 50)?.kind).toBe("caps");
    expect(headingLineOf("Vorwort und Dank", 50)).toBeNull();
  });
});

describe("headingLineOf on a title with its qualifier", () => {
  it("reads a title in capitals with a bracketed qualifier as a title", () => {
    expect(
      headingLineOf("DR. FERENCZI SANDOR (Zum 50. Geburtstag)", 80)?.kind,
    ).toBe("caps");
  });
});

describe("headingOf", () => {
  it("reads a lettered heading that names a part as a part", () => {
    const heading = headingOf([
      { kind: "letter", letter: "C" },
      { kind: "caps", text: "THEORETISCHER TEIL", size: 80 },
    ]);

    expect(heading.level).toBe(0);
  });
});

describe("isWordy", () => {
  const spelling = createSpelling([
    "Die Traumzensur entstellt den Traum; die Traumzensur ist frei.",
    // Scraps the OCR read from a picture.
    "Eee Free Eee",
  ]);

  it("takes a title in capitals made of the work's words", () => {
    expect(isWordy("DIE TRAUMZENSUR", spelling)).toBe(true);
  });

  it("leaves out a picture's scraps, however often the OCR repeats them", () => {
    expect(isWordy("RE EEE FREE EEE EEE", spelling)).toBe(false);
    expect(isWordy("ST NR NREEN ES RE E", spelling)).toBe(false);
  });
});
