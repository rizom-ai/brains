import { describe, expect, it } from "bun:test";
import { checkPages, referenceText } from "../src/check-ocr";

const reference =
  "Den Menschen der Vorzeit kennen wir in den Entwicklungsstadien, die er durchlaufen hat, durch die unbelebten Denkmäler und Geräte, die er uns hinterlassen. Er ist noch in gewissem Sinne unser Zeitgenosse; es leben Menschen, von denen wir glauben, daß sie den Primitiven noch sehr nahe stehen.";

describe("checkPages", () => {
  it("flags the words the OCR got wrong, against a transcription of the text", () => {
    const [page] = checkPages(
      [
        {
          page: 3,
          text: "Den Menschen der Vorzeit kennen wir in den Entwicklungs-\nstadien, die er durchlaufeu hat, durch die unbelebten Denkmäler",
        },
      ],
      reference,
    );

    expect(page?.covered).toBe(true);
    expect(page?.wrong).toEqual(["durchlaufeu"]);
    expect(page?.words).toBe(17);
  });

  it("reads old spelling as the same word", () => {
    const [page] = checkPages(
      [{ page: 4, text: "Er ist noch in gewissem Sinne unser Zeitgenosse" }],
      "Er ist noch in gewissem Sinne unser Zeitgenosse",
    );
    const [old] = checkPages(
      [{ page: 4, text: "Der Theil, den wir thun, ist der Teil, den wir tun" }],
      "Der Teil, den wir tun, ist der Theil, den wir thun",
    );

    expect(page?.wrong).toEqual([]);
    expect(old?.wrong).toEqual([]);
  });

  it("joins a word broken over two pages, and a compound the edition writes apart", () => {
    const checks = checkPages(
      [
        {
          page: 6,
          text: "Den Menschen der Vorzeit kennen wir in den Entwicklungs-",
        },
        {
          page: 7,
          text: "stadien, die er durchlaufen hat; er geht zugrunde, durch die unbelebten Denkmäler",
        },
      ],
      "Den Menschen der Vorzeit kennen wir in den Entwicklungsstadien, die er durchlaufen hat; er geht zu Grunde, durch die unbelebten Denkmäler",
    );

    expect(checks.map((check) => check.wrong)).toEqual([[], []]);
  });

  it("joins a word broken at a page's last line of text, above its notes", () => {
    const checks = checkPages(
      [
        {
          page: 8,
          text: "Den Menschen der Vorzeit kennen wir in den Entwicklungs-\n¹) Vgl. die Anmerkung.",
        },
        { page: 9, text: "stadien, die er durchlaufen hat" },
      ],
      "Den Menschen der Vorzeit kennen wir in den Entwicklungsstadien, die er durchlaufen hat. Vgl. die Anmerkung.",
    );

    expect(checks.map((check) => check.wrong)).toEqual([[], []]);
  });

  it("leaves out a page the transcription's edition does not have", () => {
    const [page] = checkPages(
      [
        {
          page: 5,
          text: "Ein ganz anderer Absatz, den erst eine spätere Auflage hinzugefügt hat, steht hier allein.",
        },
      ],
      reference,
    );

    expect(page?.covered).toBe(false);
  });
});

describe("referenceText", () => {
  it("takes a Gutenberg text between its start and end marks", () => {
    const raw = [
      "The Project Gutenberg eBook of Totem und Tabu",
      "*** START OF THE PROJECT GUTENBERG EBOOK TOTEM UND TABU ***",
      "Den Menschen der Vorzeit",
      "*** END OF THE PROJECT GUTENBERG EBOOK TOTEM UND TABU ***",
      "License text",
    ].join("\n");

    expect(referenceText(raw).trim()).toBe("Den Menschen der Vorzeit");
  });
});
