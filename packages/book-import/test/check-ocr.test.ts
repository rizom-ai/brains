import { describe, expect, it } from "bun:test";
import {
  checkPages,
  referenceCorrections,
  referenceText,
} from "../src/check-ocr";

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

  it("counts no word of a passage the transcription's edition lacks", () => {
    const [page] = checkPages(
      [
        {
          page: 3,
          text: "Den Menschen der Vorzeit kennen wir in den Entwicklungsstadien, die er durchlaufen hat. Später kam ein Absatz über Kanzleischlüssel hinzu. Er ist noch in gewissem Sinne unser Zeitgenosse; es leben Menschen, von denen wir glauben",
        },
      ],
      reference,
    );

    expect(page?.covered).toBe(true);
    expect(page?.wrong).toEqual([]);
  });

  it("counts no real word where the transcription's edition reads otherwise", () => {
    const [page] = checkPages(
      [
        {
          page: 4,
          text: "Er ist noch in gewissem Sinne unser Zeitgenosse; es leben Menschen",
        },
      ],
      "Er ist noch in gewissen Sinne unser Zeitgenosse; es leben Menschen",
      (word) => word === "gewissem",
    );

    expect(page?.wrong).toEqual([]);
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

describe("referenceCorrections", () => {
  const reference =
    "Ich habe die Absicht, nach Hause zu gehen, wenn es dunkel wird. Er suchte die Lösung, welcher er folgen konnte, und fand sie.";

  it("fixes a misread word where the words around it match the transcription", () => {
    expect(
      referenceCorrections(
        [{ page: 8, text: "Ich habe ie Absicht, nach Hause zu gehen," }],
        reference,
      ),
    ).toEqual([
      {
        page: 8,
        from: "Ich habe ie Absicht, nach",
        to: "Ich habe die Absicht, nach",
      },
    ]);
  });

  it("replaces a run of scraps with the transcription's words between", () => {
    expect(
      referenceCorrections(
        [{ page: 9, text: "Er suchte die Bu ah Ib welcher er folgen konnte" }],
        reference,
      ),
    ).toEqual([
      {
        page: 9,
        from: "suchte die Bu ah Ib welcher er",
        to: "suchte die Lösung, welcher er",
      },
    ]);
  });

  it("leaves a word alone where the words around it are not the transcription's", () => {
    expect(
      referenceCorrections(
        [{ page: 10, text: "Ganz andere Worte stehen hier xqz und anderswo." }],
        reference,
      ),
    ).toEqual([]);
  });
});

describe("referenceCorrections between editions", () => {
  it("keeps a word the author's text uses elsewhere, though this edition has another", () => {
    const corpus = new Set(["beginne"]);

    expect(
      referenceCorrections(
        [{ page: 9, text: "ursprünglich im Beginne der Zeiten war" }],
        "ursprünglich im Beginn der Zeiten war",
        (word) => corpus.has(word.toLowerCase()),
      ),
    ).toEqual([]);
  });

  it("sets the transcription's dashes and quotes as the edition prints them", () => {
    expect(
      referenceCorrections(
        [{ page: 28, text: "im allgemeinen — ügegen das mächtige" }],
        "im allgemeinen -- gegen das mächtige",
      ),
    ).toEqual([
      {
        page: 28,
        from: "im allgemeinen — ügegen das mächtige",
        to: "im allgemeinen — gegen das mächtige",
      },
    ]);
  });
});
