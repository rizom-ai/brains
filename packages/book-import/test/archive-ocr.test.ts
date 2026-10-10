import { describe, expect, it } from "bun:test";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import {
  pageText,
  parseArchiveOcrWork,
  printedPageNumbers,
  type LeafReading,
} from "../src/adapters/archive-ocr";

async function fixture(): Promise<string> {
  return readFile(
    join(import.meta.dir, "fixtures", "archive-ocr-gw.html"),
    "utf8",
  );
}

const work = {
  item: "freud-1940-gw-13",
  title: "Jenseits des Lustprinzips",
  citation: "GW XIII",
  firstPage: 3,
  lastPage: 10,
};

describe("parseArchiveOcrWork", () => {
  it("splits a work at its chapter numerals, each cited by volume and page", async () => {
    const units = parseArchiveOcrWork(await fixture(), work);

    expect(units.map((unit) => [unit.title, unit.section, unit.page])).toEqual([
      ["I", "GW XIII, 3", "GW XIII, 3"],
      ["II", "GW XIII, 9", "GW XIII, 9"],
    ]);
    expect(units[0]?.source).toBe(
      "https://archive.org/details/freud-1940-gw-13/page/n12",
    );
  });

  it("reads paragraphs by their indent, across pages, joining broken words", async () => {
    const [first] = parseArchiveOcrWork(await fixture(), work);

    expect(first?.paragraphs.slice(0, 3)).toEqual([
      "In der psychoanalytischen Theorie nehmen wir unbedenklich an, daß der Ablauf der seelischen Vorgänge automatisch durch das Lustprinzip reguliert wird. Wir führen den ökonomischen Gesichtspunkt in unsere Arbeit ein.",
      "Es hat dabei für uns kein Interesse, zu untersuchen, inwieweit wir uns mit der Aufstellung des Lustprinzips einem bestimmten, historisch festgelegten System angenähert haben.¹) Wir gelangen zu solchen Annahmen bei dem Bemühen, von den Tatsachen einerseits Beschreibung und Rechenschaft zu geben.",
      "Die Ich-Analyse beginnt hier.",
    ]);
    // Low on a curved page: a dipping measured size is still body text, and a
    // word pushed below its line still belongs to it.
    expect(first?.paragraphs[3]).toBe(
      "Ein Satz unten auf der Seite läuft weiter, und am Rand rutscht ein Wort nach unten.",
    );
  });

  it("keeps the author's footnotes as notes after the chapter", async () => {
    const [first] = parseArchiveOcrWork(await fixture(), work);

    expect(first?.paragraphs.at(-1)).toBe(
      "¹) Vgl. Zur Psychoanalyse der Kriegsneurosen. Mit Beiträgen von Ferenczi, Abraham, Simmel und E. Jones, 1919.",
    );
  });

  it("drops running heads, rules and printer's signatures, and pages outside the work", async () => {
    const units = parseArchiveOcrWork(await fixture(), work);
    const text = units.flatMap((unit) => unit.paragraphs).join("\n");

    expect(units[1]?.paragraphs).toEqual([
      "Nach schweren mechanischen Erschütterungen ist ein Zustand beschrieben worden.",
      "Ein volles Verständnis ist bisher nicht erzielt worden.",
    ]);
    expect(text).not.toContain("Jenseits des Lustprinzips");
    expect(text).not.toContain("Freud, XIII");
    expect(text).not.toContain("anderes Werk");
    expect(text).not.toContain("JENSEITS");
    expect(text).not.toContain("NRLNEE");
  });
});

describe("parseArchiveOcrWork on notes left out", () => {
  it("leaves out the notes the manifest names by page and opening, such as an editor's", async () => {
    const [first] = parseArchiveOcrWork(await fixture(), {
      ...work,
      skipNotes: [{ page: 4, opens: "¹) Vgl. Zur Psychoanalyse" }],
    });

    expect(first?.paragraphs.join("\n")).not.toContain("Kriegsneurosen");
  });

  it("stops on a note left out that names no note", async () => {
    expect(async () =>
      parseArchiveOcrWork(await fixture(), {
        ...work,
        skipNotes: [{ page: 3, opens: "¹) Vgl. Zur Psychoanalyse" }],
      }),
    ).toThrow('No note "¹) Vgl. Zur Psychoanalyse" on page 3 to leave out');
  });
});

describe("parseArchiveOcrWork on pages left out", () => {
  it("leaves out the pages the manifest names, such as an editors' note", async () => {
    const units = parseArchiveOcrWork(await fixture(), {
      ...work,
      skipPages: [4],
    });
    const text = units.flatMap((unit) => unit.paragraphs).join("\n");

    expect(text).not.toContain("historisch festgelegten");
    expect(text).not.toContain("Kriegsneurosen");
    expect(text).toContain("Die Ich-Analyse beginnt hier.");
  });
});

describe("parseArchiveOcrWork with corrections", () => {
  it("replaces a line's misread words on the page the correction names", async () => {
    const units = parseArchiveOcrWork(await fixture(), {
      ...work,
      corrections: [{ page: 5, from: "rutscht ein", to: "rückt ein" }],
    });

    expect(units[0]?.paragraphs[3]).toBe(
      "Ein Satz unten auf der Seite läuft weiter, und am Rand rückt ein Wort nach unten.",
    );
  });

  it("drops a line a correction empties", async () => {
    const units = parseArchiveOcrWork(await fixture(), {
      ...work,
      corrections: [{ page: 5, from: "nach unten.", to: "" }],
    });

    expect(units[0]?.paragraphs[3]).toBe(
      "Ein Satz unten auf der Seite läuft weiter, und am Rand rutscht ein Wort",
    );
  });

  it("fixes one place: the line that is the correction's text, else the first that holds it", async () => {
    const page = pageText(await fixture(), 5, [
      { page: 5, from: "nach unten.", to: "hinab." },
      { page: 5, from: "e", to: "E" },
    ]);

    expect(page.split("\n")).toEqual([
      "DiE Ich-",
      "Analyse beginnt hier.",
      "Ein Satz unten auf der Seite",
      "läuft weiter, und am Rand rutscht ein Wort",
      "hinab.",
    ]);
  });

  it("fixes a heading's line before the heading is read, where no text line is the correction's", async () => {
    const page = pageText(await fixture(), 3, [
      { page: 3, from: "I", to: "II" },
    ]);

    expect(page.split("\n").slice(0, 2)).toEqual([
      "II",
      "In der psychoanalytischen Theorie nehmen wir unbedenklich",
    ]);
  });

  it("stops on a correction that finds nothing to fix", async () => {
    const hocr = await fixture();

    expect(() =>
      parseArchiveOcrWork(hocr, {
        ...work,
        corrections: [{ page: 5, from: "nicht da", to: "da" }],
      }),
    ).toThrow('No "nicht da" on page 5 to correct');
  });

  it("reads a page's text with its corrections", async () => {
    expect(
      pageText(await fixture(), 5, [
        { page: 5, from: "rutscht ein", to: "rückt ein" },
      ]),
    ).toContain("rückt ein");
  });
});

describe("parseArchiveOcrWork on a scan's flaws", () => {
  it("numbers chapters in order whatever the OCR read", async () => {
    const units = parseArchiveOcrWork(await fixture(), work);

    expect(units.map((unit) => unit.title)).toEqual(["I", "II"]);
  });

  it("reads a line the OCR split at the same height as one line, and drops edge noise", async () => {
    const [, second] = parseArchiveOcrWork(await fixture(), work);

    expect(second?.paragraphs).toEqual([
      "Nach schweren mechanischen Erschütterungen ist ein Zustand beschrieben worden.",
      "Ein volles Verständnis ist bisher nicht erzielt worden.",
    ]);
  });
});

describe("parseArchiveOcrWork on headings", () => {
  const lectures = {
    item: "freud-1940-gw-11",
    title: "Vorlesungen zur Einführung in die Psychoanalyse",
    citation: "GW XI",
    firstPage: 3,
    lastPage: 10,
  };

  async function headings(): Promise<string> {
    return readFile(
      join(import.meta.dir, "fixtures", "archive-ocr-headings.html"),
      "utf8",
    );
  }

  it("reads parts, chapters and subsections, cased as the text spells their words", async () => {
    const units = parseArchiveOcrWork(await headings(), lectures);

    expect(
      units.map((unit) => [unit.parents, unit.title, unit.section]),
    ).toEqual([
      [
        ["Erster Teil. Die Fehlleistungen", "I. Einleitung"],
        "I. Einleitung",
        "GW XI, 3",
      ],
      [
        ["Erster Teil. Die Fehlleistungen", "I. Einleitung"],
        "A. Das Rezente und das Indifferente im Traum",
        "GW XI, 4",
      ],
      [
        ["Erster Teil. Die Fehlleistungen"],
        "II. Die Traumzensur (Fortsetzung)",
        "GW XI, 6",
      ],
      [
        ["Zweiter Teil. Der Traum", "III. Der Traum"],
        "III. Der Traum",
        "GW XI, 9",
      ],
      [
        ["Zweiter Teil. Der Traum", "III. Der Traum"],
        "H. Die Träume",
        "GW XI, 10",
      ],
      [
        ["Zweiter Teil. Der Traum", "III. Der Traum"],
        "I. Die sekundäre Bearbeitung und ihre Folgen für den Traum",
        "GW XI, 10",
      ],
    ]);
  });

  it("leaves out a section the manifest names, such as a piece in another language", async () => {
    const units = parseArchiveOcrWork(await headings(), {
      ...lectures,
      skipHeadings: ["Die Traumzensur"],
    });
    const text = units.flatMap((unit) => unit.paragraphs).join("\n");

    expect(units.map((unit) => unit.title)).not.toContain(
      "II. Die Traumzensur (Fortsetzung)",
    );
    expect(text).not.toContain("entstellt ihn");
    expect(units.map((unit) => unit.title)).toContain("III. Der Traum");
  });

  it("numbers chapters on from where the manifest says the work begins", async () => {
    const units = parseArchiveOcrWork(await headings(), {
      ...lectures,
      firstChapter: 29,
    });

    expect(units.map((unit) => unit.title)).toContain(
      "XXX. Die Traumzensur (Fortsetzung)",
    );
  });

  it("drops the work's own title and a running head whose page number the OCR lost", async () => {
    const units = parseArchiveOcrWork(await headings(), lectures);
    const text = units.flatMap((unit) => unit.paragraphs).join("\n");

    expect(units[0]?.paragraphs[0]).toBe(
      "Meine Damen und Herren! Die Fehlleistungen sind ein Thema, über das wir sprechen werden.",
    );
    expect(units[1]?.paragraphs).toEqual([
      "Das Rezente und das Indifferente im Traum zeigen sich in jedem Fall. Das gilt auch für die Traumzensur, wie wir sehen werden, wenn wir den Traum weiter untersuchen.",
    ]);
    expect(text).not.toContain("VORLESUNGEN");
    expect(text).not.toContain("Nah");
  });

  it("reads an example's numeral in a subsection as no chapter, and a dotless i as an i", async () => {
    const units = parseArchiveOcrWork(await headings(), lectures);

    expect(units[3]?.paragraphs).toEqual([
      "Der Traum ist ein Thema für sich, und wir werden ihn nun untersuchen. Wir sehen, wie der Traum sich in jedem Fall zeigt.",
    ]);
    expect(units[4]?.paragraphs).toEqual([
      "Sie sehen nun, wie die Träume entstehen.",
      "„Ein schöner Traum“",
      "Ein neues Beispiel folgt hier, und es ist ein Traum.",
    ]);
  });

  it("leaves out a decorated page's picture and stray marks beside the text", async () => {
    const units = parseArchiveOcrWork(await headings(), lectures);
    const text = units.flatMap((unit) => unit.paragraphs).join("\n");

    expect(units[3]?.paragraphs[0]).toStartWith("Der Traum ist ein Thema");
    expect(text).not.toContain("Fear");
    expect(text).not.toContain("Br er");
  });
});

describe("parseArchiveOcrWork on an essay's sections", () => {
  it("reads sections by their numerals, however misread and wherever on the page", async () => {
    const units = parseArchiveOcrWork(
      await readFile(
        join(import.meta.dir, "fixtures", "archive-ocr-sections.html"),
        "utf8",
      ),
      {
        item: "freud-1946-gw-10",
        title: "Das Unbewußte",
        citation: "GW X",
        firstPage: 19,
        lastPage: 22,
      },
    );

    // The half-title, a picture's scraps and a stray note marker are no
    // headings; only the numbered sections are.
    expect(units.map((unit) => [unit.title, unit.section])).toEqual([
      ["GW X, 20", "GW X, 20"],
      ["I. Die Rechtfertigung des Unbewußten", "GW X, 20"],
      ["II. Unbewußte Gefühle", "GW X, 21"],
    ]);
    expect(units[1]?.paragraphs).toEqual([
      "Die Berechtigung, ein unbewußtes Seelisches anzunehmen, wird uns von vielen Seiten bestritten. Wir können darauf mit dem Hinweis antworten, daß die Annahme notwendig ist.",
    ]);
  });
});

describe("parseArchiveOcrWork on a work's opening", () => {
  it("keeps an opening heading that is not the work's title", async () => {
    const units = parseArchiveOcrWork(
      await readFile(
        join(import.meta.dir, "fixtures", "archive-ocr-sections.html"),
        "utf8",
      ),
      {
        item: "freud-1952-gw-1",
        title: "Studien über Hysterie",
        citation: "GW I",
        firstPage: 20,
        lastPage: 22,
      },
    );

    expect(units[0]?.title).toBe("Das Unbewußte");
  });
});

describe("parseArchiveOcrWork on front matter", () => {
  it("cites pages before the first by their roman numbers, and starts a work there", async () => {
    const units = parseArchiveOcrWork(
      await readFile(
        join(import.meta.dir, "fixtures", "archive-ocr-front.html"),
        "utf8",
      ),
      {
        item: "freud-1942-gw-2-3",
        title: "Die Traumdeutung",
        citation: "GW II/III",
        firstPage: "V",
        lastPage: 3,
      },
    );

    expect(
      units.map((unit) => [unit.parents, unit.title, unit.section]),
    ).toEqual([
      [[], "Vorbemerkung", "GW II/III, V"],
      [[], "Vorwort zur zweiten Auflage", "GW II/III, VII"],
      [[], "I", "GW II/III, 1"],
    ]);
    expect(units[1]?.paragraphs).toEqual([
      "Daß es von diesem Buche zur zweiten Auflage kommen würde, verdanke ich nicht dem Interesse der Fachkreise.",
    ]);
  });
});

describe("printedPageNumbers", () => {
  /** A text page: its running head's number, or none where a chapter opens. */
  const text = (leaf: number, head: number | null): LeafReading => ({
    leaf,
    head,
    words: 300,
  });
  /** A plate: a picture between the pages, with no running text. */
  const plate = (leaf: number): LeafReading => ({
    leaf,
    head: null,
    words: 2,
  });

  it("numbers every page from its running heads, also pages that open a chapter", () => {
    const pages = printedPageNumbers([
      text(10, null),
      text(11, 2),
      text(12, 3),
      text(13, null),
      text(14, 5),
    ]);

    expect([10, 11, 12, 13, 14].map((leaf) => pages.get(leaf))).toEqual([
      1, 2, 3, 4, 5,
    ]);
  });

  it("leaves a plate between the pages unnumbered and numbers on after it", () => {
    const pages = printedPageNumbers([
      text(10, 1),
      text(11, 2),
      text(12, 3),
      plate(13),
      plate(14),
      text(15, null),
      text(16, 5),
      text(17, 6),
    ]);

    expect([12, 13, 14, 15, 16].map((leaf) => pages.get(leaf))).toEqual([
      3,
      null,
      null,
      4,
      5,
    ]);
  });

  it("ignores a run of page numbers the OCR misread alike", () => {
    // 335 and 338 both read with a 5 for the 3.
    const pages = printedPageNumbers([
      text(10, 330),
      text(11, 331),
      text(12, 332),
      text(13, 333),
      text(14, 334),
      text(15, 355),
      text(16, 336),
      text(17, 337),
      text(18, 358),
      text(19, 339),
      text(20, 340),
      text(21, 341),
    ]);

    expect([15, 18].map((leaf) => pages.get(leaf))).toEqual([335, 338]);
  });

  it("ignores consecutive page numbers the OCR misread alike", () => {
    const pages = printedPageNumbers([
      text(10, 330),
      text(11, 331),
      text(12, 332),
      text(13, 333),
      text(14, 354),
      text(15, 355),
      text(16, 356),
      text(17, 337),
      text(18, 338),
      text(19, 339),
    ]);

    expect([14, 15, 16].map((leaf) => pages.get(leaf))).toEqual([
      334, 335, 336,
    ]);
  });

  it("ignores a long run of page numbers the OCR misread alike", () => {
    // 317 to 329 all read with a 5 for the 3, among the right ones.
    const heads = [
      ...Array.from({ length: 10 }, (_, index) =>
        text(10 + index, 307 + index),
      ),
      ...Array.from({ length: 13 }, (_, index) =>
        text(20 + index, 517 + index),
      ),
      ...Array.from({ length: 15 }, (_, index) =>
        text(33 + index, 330 + index),
      ),
    ];
    const pages = printedPageNumbers(heads);

    expect([20, 26, 32].map((leaf) => pages.get(leaf))).toEqual([
      317, 323, 329,
    ]);
  });

  it("ignores a page number the OCR misread", () => {
    const pages = printedPageNumbers([
      text(10, 1),
      text(11, 2),
      text(12, 53),
      text(13, 4),
      text(14, 5),
    ]);

    expect(pages.get(12)).toBe(3);
  });
});

describe("parseArchiveOcrWork on long chapters", () => {
  it("splits a chapter at paragraphs, each part cited from the page it starts on", async () => {
    const units = parseArchiveOcrWork(await fixture(), work, {
      entryBytes: 200,
    });

    expect(units.map((unit) => [unit.title, unit.section])).toEqual([
      ["I", "GW XIII, 3"],
      ["I", "GW XIII, 3"],
      ["I", "GW XIII, 5"],
      ["II", "GW XIII, 9"],
    ]);
    // A footnote goes with the part whose pages hold it.
    expect(units[1]?.paragraphs.at(-1)).toStartWith("¹) Vgl.");
    expect(units[2]?.paragraphs[0]).toBe("Die Ich-Analyse beginnt hier.");
  });
});

describe("parseArchiveOcrWork, titles in display type", () => {
  it("takes a title set larger than the text under its numeral, however wide", async () => {
    const units = parseArchiveOcrWork(
      await readFile(
        join(import.meta.dir, "fixtures", "archive-ocr-wide-titles.html"),
        "utf8",
      ),
      {
        item: "dieklassenkmpf00marxuoft",
        title: "Die Klassenkämpfe in Frankreich 1848 bis 1850",
        citation: "Klassenkämpfe",
        firstPage: 20,
        lastPage: 23,
      },
    );

    expect(units.map((unit) => [unit.title, unit.section])).toEqual([
      ["I. Vom Februar bis Juni 1848.", "Klassenkämpfe, 20"],
      ["II. Vom Juni 1848 bis 13. Juni 1849.", "Klassenkämpfe, 22"],
    ]);
    expect(units[1]?.paragraphs).toEqual([
      "Der 25. Februar 1848 hatte Frankreich die Republik oktroyirt, der 25. Juni drang ihm die Revolution auf. Und Revolution bedeutete nach dem Juni: Umwälzung der bürgerlichen Gesellschaft.",
    ]);
  });
});

describe("parseArchiveOcrWork, pages numbered by a bare number", () => {
  it("reads a page number standing alone at the head of the page", async () => {
    const units = parseArchiveOcrWork(
      await readFile(
        join(import.meta.dir, "fixtures", "archive-ocr-bare-heads.html"),
        "utf8",
      ),
      {
        item: "10067670bsb",
        title: "Herr Vogt",
        citation: "Herr Vogt",
        firstPage: 20,
        lastPage: 23,
      },
    );

    expect(units.map((unit) => unit.section)).toEqual([
      "Herr Vogt, 20",
      "Herr Vogt, 22",
    ]);
  });
});

describe("parseArchiveOcrWork, a running head read as two lines", () => {
  it("leaves out the head's title under its bare number", async () => {
    const units = parseArchiveOcrWork(
      await readFile(
        join(import.meta.dir, "fixtures", "archive-ocr-split-heads.html"),
        "utf8",
      ),
      {
        item: "dieklassenkmpf00marxuoft",
        title: "Die Klassenkämpfe in Frankreich 1848 bis 1850",
        citation: "Klassenkämpfe",
        firstPage: 20,
        lastPage: 23,
      },
    );

    expect(units[1]?.paragraphs).toEqual([
      "Der 25. Februar 1848 hatte Frankreich die Republik oktroyirt, der 25. Juni drang ihm die Revolution auf. Und Revolution bedeutete nach dem Juni: Umwälzung der bürgerlichen Gesellschaft.",
    ]);
  });
});

describe("parseArchiveOcrWork, a chapter's numeral and title on one line", () => {
  it("reads a centred line of numeral and title as the chapter's heading", async () => {
    const units = parseArchiveOcrWork(
      await readFile(
        join(import.meta.dir, "fixtures", "archive-ocr-numbered-titles.html"),
        "utf8",
      ),
      {
        item: "10067670bsb",
        title: "Herr Vogt",
        citation: "Herr Vogt",
        firstPage: 20,
        lastPage: 23,
      },
    );

    expect(units.map((unit) => unit.title)).toEqual([
      "I. Die Schwefelbande.",
      "II. Die Bürstenheimer.",
    ]);
  });
});

describe("parseArchiveOcrWork, front matter numbered by a bare roman numeral", () => {
  it("reads a roman page number standing alone at the head of the page", async () => {
    const units = parseArchiveOcrWork(
      await readFile(
        join(import.meta.dir, "fixtures", "archive-ocr-roman-heads.html"),
        "utf8",
      ),
      {
        item: "10067670bsb",
        title: "Herr Vogt",
        citation: "Herr Vogt",
        firstPage: "III",
        lastPage: 2,
      },
    );

    expect(units[0]?.section).toBe("Herr Vogt, III");
    expect(units[0]?.title).toBe("Vorwort.");
    expect(units[0]?.paragraphs[0]).toBe(
      "Unter dem Datum veröffentlichte ich eine Erklärung. Der Prozeß wurde niedergeschlagen.",
    );
  });
});

describe("parseArchiveOcrWork, titles set in display type", () => {
  it("reads a centred line set larger than the text as a title, and the lines it runs on through", async () => {
    const units = parseArchiveOcrWork(
      await readFile(
        join(import.meta.dir, "fixtures", "archive-ocr-display-titles.html"),
        "utf8",
      ),
      {
        item: "mehring-nachlass-2",
        title:
          "Kritische Randglossen zu dem Artikel: Der König von Preußen und die Sozialreform",
        citation: "Nachlass II",
        firstPage: 41,
        lastPage: 42,
      },
    );

    // The work's own title opens it, and is left out as the manifest gives it.
    expect(units.map((unit) => unit.title)).toEqual([
      "Nachlass II, 41",
      "Der Aufstand der Weber.",
    ]);
    expect(units[0]?.paragraphs[0]).toStartWith("Die Nr. 60 des Vorwärts");
    expect(units[1]?.paragraphs).toEqual([
      "Zunächst erinnere man sich an das Weberlied, an diese kühne Parole des Kampfes. Der Aufstand der Weber galt dem König von Preussen, nicht Ludwig XIV.",
    ]);
  });

  it("leaves out the printer's signature at the foot of a sheet, whatever volume it names", async () => {
    const units = parseArchiveOcrWork(
      await readFile(
        join(import.meta.dir, "fixtures", "archive-ocr-display-titles.html"),
        "utf8",
      ),
      {
        item: "mehring-nachlass-2",
        title:
          "Kritische Randglossen zu dem Artikel: Der König von Preußen und die Sozialreform",
        citation: "Nachlass II",
        firstPage: 41,
        lastPage: 42,
      },
    );

    expect(units.flatMap((unit) => unit.paragraphs).join("\n")).not.toContain(
      "Lassalle",
    );
  });

  it("reads a title as wide as the text as a title where space sets it apart", async () => {
    const units = parseArchiveOcrWork(
      await readFile(
        join(import.meta.dir, "fixtures", "archive-ocr-display-titles.html"),
        "utf8",
      ),
      {
        item: "mehring-nachlass-2",
        title:
          "Kritische Randglossen zu dem Artikel: Der König von Preußen und die Sozialreform",
        citation: "Nachlass II",
        firstPage: 41,
        lastPage: 43,
      },
    );

    expect(units.at(-1)?.title).toBe(
      "Der Kommunismus des Rheinischen Beobachters.",
    );
    expect(units.at(-1)?.paragraphs[0]).toStartWith("In Nr. 70 dieses Blattes");
  });

  it("reads a rule in the page's lower half as a section's end where the text after it is not set smaller", async () => {
    const units = parseArchiveOcrWork(
      await readFile(
        join(import.meta.dir, "fixtures", "archive-ocr-display-titles.html"),
        "utf8",
      ),
      {
        item: "mehring-nachlass-2",
        title:
          "Kritische Randglossen zu dem Artikel: Der König von Preußen und die Sozialreform",
        citation: "Nachlass II",
        firstPage: 41,
        lastPage: 44,
      },
    );

    expect(units.at(-1)?.title).toBe(
      "I. Weltgang und Verklärung der kritischen Kritik, oder die kritische Kritik als Rudolf, Fürst von Gerolstein.",
    );
    expect(units.at(-1)?.paragraphs).toEqual([
      "Rudolf, Fürst von Gerolstein, büßt in seinem Weltgang ein doppeltes Vergehen, sein persönliches Vergehen und das der Kritik.",
    ]);
  });

  it("centres a title on the page's text column, which the scan may set off its middle, and runs it on through lines in title type", async () => {
    const units = parseArchiveOcrWork(
      await readFile(
        join(import.meta.dir, "fixtures", "archive-ocr-display-titles.html"),
        "utf8",
      ),
      {
        item: "mehring-nachlass-2",
        title:
          "Kritische Randglossen zu dem Artikel: Der König von Preußen und die Sozialreform",
        citation: "Nachlass II",
        firstPage: 41,
        lastPage: 45,
      },
    );

    expect(units.at(-1)?.title).toBe(
      "II. Das kritische jüngste Gericht der Kritik und des Preussen, oder die Kritik als Herr Bruno.",
    );
  });

  it("reads a centred line of a number and a title as a numbered subsection", async () => {
    const units = parseArchiveOcrWork(
      await readFile(
        join(import.meta.dir, "fixtures", "archive-ocr-display-titles.html"),
        "utf8",
      ),
      {
        item: "mehring-nachlass-2",
        title:
          "Kritische Randglossen zu dem Artikel: Der König von Preußen und die Sozialreform",
        citation: "Nachlass II",
        firstPage: 41,
        lastPage: 46,
      },
    );

    expect(
      units.slice(-2).map((unit) => [unit.parents.at(-1), unit.title]),
    ).toEqual([
      [
        "III. Die kritische Kritik als die Ruhe des Erkennens.",
        "1. Die Union ouvrière der Flora Tristan.",
      ],
      [
        "III. Die kritische Kritik als die Ruhe des Erkennens.",
        "2. Beraud über die Freudenmädchen.",
      ],
    ]);
    expect(units.at(-1)?.paragraphs).toEqual([
      "Herr Edgar, der nun einmal der sozialen Fragen sich erbarmt, und die Kritik des Preussen.",
    ]);
  });

  it("follows a title ending in a comma with its subtitle after a space", async () => {
    const units = parseArchiveOcrWork(
      await readFile(
        join(import.meta.dir, "fixtures", "archive-ocr-display-titles.html"),
        "utf8",
      ),
      {
        item: "mehring-nachlass-2",
        title:
          "Kritische Randglossen zu dem Artikel: Der König von Preußen und die Sozialreform",
        citation: "Nachlass II",
        firstPage: 41,
        lastPage: 52,
      },
    );

    expect(units.at(-1)?.title).toBe(
      "VI. Rede über den Preussen, gehalten vor der Masse.",
    );
  });

  it("joins a title's lines with one full stop between them", async () => {
    const units = parseArchiveOcrWork(
      await readFile(
        join(import.meta.dir, "fixtures", "archive-ocr-display-titles.html"),
        "utf8",
      ),
      {
        item: "mehring-nachlass-2",
        title:
          "Kritische Randglossen zu dem Artikel: Der König von Preußen und die Sozialreform",
        citation: "Nachlass II",
        firstPage: 41,
        lastPage: 47,
      },
    );

    expect(units.at(-1)?.title).toBe(
      "IV. Die absolute Kritik. Der Geist und die Masse.",
    );
  });

  it("reads a numbered line inside a lettered subsection as an example in the text", async () => {
    const units = parseArchiveOcrWork(
      await readFile(
        join(import.meta.dir, "fixtures", "archive-ocr-display-titles.html"),
        "utf8",
      ),
      {
        item: "mehring-nachlass-2",
        title:
          "Kritische Randglossen zu dem Artikel: Der König von Preußen und die Sozialreform",
        citation: "Nachlass II",
        firstPage: 41,
        lastPage: 48,
      },
    );

    expect(units.at(-1)?.title).toBe("E. Die Kritik des Preussen");
    expect(units.at(-1)?.paragraphs).toContain("5. Ein Aufstand der Weber.");
  });

  it("reads a chapter named by its number and the word as a chapter", async () => {
    const units = parseArchiveOcrWork(
      await readFile(
        join(import.meta.dir, "fixtures", "archive-ocr-display-titles.html"),
        "utf8",
      ),
      {
        item: "mehring-nachlass-2",
        title:
          "Kritische Randglossen zu dem Artikel: Der König von Preußen und die Sozialreform",
        citation: "Nachlass II",
        firstPage: 41,
        lastPage: 49,
      },
    );

    expect(units.at(-1)?.title).toBe("V. Die Masse und der Preusse.");
  });

  it("reads a title of two lines at a page's head as set apart, and a title in brackets", async () => {
    const units = parseArchiveOcrWork(
      await readFile(
        join(import.meta.dir, "fixtures", "archive-ocr-display-titles.html"),
        "utf8",
      ),
      {
        item: "mehring-nachlass-1",
        title:
          "Kritische Randglossen zu dem Artikel: Der König von Preußen und die Sozialreform",
        citation: "Nachlass I",
        firstPage: 41,
        lastPage: 51,
      },
    );

    expect(units.slice(-2).map((unit) => unit.title)).toEqual([
      "Der leitende Artikel in der Zeitung des Preussen.",
      "[Ueber Kommunismus.]",
    ]);
    expect(units.at(-1)?.paragraphs[0]).toStartWith("Die Zeitung des Preussen");
  });

  it("leaves out a signature whose first name ends with a full stop where more names follow", async () => {
    const units = parseArchiveOcrWork(
      await readFile(
        join(import.meta.dir, "fixtures", "archive-ocr-display-titles.html"),
        "utf8",
      ),
      {
        item: "mehring-nachlass-1",
        title:
          "Kritische Randglossen zu dem Artikel: Der König von Preußen und die Sozialreform",
        citation: "Nachlass I",
        firstPage: 41,
        lastPage: 51,
      },
    );

    expect(units.at(-1)?.paragraphs.join(" ")).not.toContain("Lassalle");
  });
});

describe("parseArchiveOcrWork, parts and roman sections", () => {
  it("reads a part spelled Theil, and centred lines of a roman number and a title as its sections", async () => {
    const units = parseArchiveOcrWork(
      await readFile(
        join(import.meta.dir, "fixtures", "archive-ocr-roman-sections.html"),
        "utf8",
      ),
      {
        item: "mehring-nachlass-1",
        title:
          "Differenz der demokritischen und epikureischen Naturphilosophie",
        citation: "Nachlass I",
        firstPage: 71,
        lastPage: 73,
      },
    );

    expect(units.map((unit) => [unit.parents.at(-1), unit.title])).toEqual([
      [
        "Erster Theil. Differenz der demokritischen und epikureischen Naturphilosophie im Allgemeinen.",
        "I. Gegenstand der Abhandlung.",
      ],
      [
        "Erster Theil. Differenz der demokritischen und epikureischen Naturphilosophie im Allgemeinen.",
        "II. Urtheile über das Verhältniss der demokritischen und epikureischen Physik.",
      ],
    ]);
  });

  it("reads a numbered line as wide as the text as a section where space above sets it apart", async () => {
    const units = parseArchiveOcrWork(
      await readFile(
        join(import.meta.dir, "fixtures", "archive-ocr-roman-sections.html"),
        "utf8",
      ),
      {
        item: "mehring-nachlass-1",
        title:
          "Differenz der demokritischen und epikureischen Naturphilosophie",
        citation: "Nachlass I",
        firstPage: 71,
        lastPage: 74,
      },
    );

    expect(units.at(-1)?.title).toBe(
      "III. Schwierigkeiten hinsichtlich der Identität demokritischer und epikureischer Naturphilosophie.",
    );
  });

  it("reads the centred line after a chapter named in words as its title, though wider than a misread title", async () => {
    const units = parseArchiveOcrWork(
      await readFile(
        join(import.meta.dir, "fixtures", "archive-ocr-roman-sections.html"),
        "utf8",
      ),
      {
        item: "mehring-nachlass-1",
        title:
          "Differenz der demokritischen und epikureischen Naturphilosophie",
        citation: "Nachlass I",
        firstPage: 71,
        lastPage: 75,
      },
    );

    expect(units.at(-1)?.title).toBe(
      "I. Die Deklination des Atoms von der geraden Linie.",
    );
  });

  it("takes a line a correction sets as known words, though in another script", async () => {
    const units = parseArchiveOcrWork(
      await readFile(
        join(import.meta.dir, "fixtures", "archive-ocr-roman-sections.html"),
        "utf8",
      ),
      {
        item: "mehring-nachlass-1",
        title:
          "Differenz der demokritischen und epikureischen Naturphilosophie",
        citation: "Nachlass I",
        firstPage: 71,
        lastPage: 76,
        corrections: [
          {
            page: 76,
            from: "Hrouνοεt hεεαι und πτ%ιμια ποινεια.",
            to: "Ἄτομοι ἀρχαί und ἄτομα στοιχεῖα.",
          },
        ],
      },
    );

    expect(units.at(-1)?.title).toBe("II. Ἄτομοι ἀρχαί und ἄτομα στοιχεῖα.");
  });
});

describe("parseArchiveOcrWork, notes marked by asterisks", () => {
  it("reads a line that opens with an asterisk low on the page as a note, though set as large as the text", async () => {
    const units = parseArchiveOcrWork(
      await readFile(
        join(import.meta.dir, "fixtures", "archive-ocr-star-notes.html"),
        "utf8",
      ),
      {
        item: "ldpd_14861084_000",
        title: "Das Elend der Philosophie",
        citation: "Elend",
        firstPage: 70,
        lastPage: 71,
      },
    );

    expect(units[0]?.paragraphs).toEqual([
      "Der Titre des Geldes ist der Werth der Dinge, und dies gilt ebenso von Gold und Silber, wie von Getreide und Wein. Indess, kaum war der Betrug ruchbar geworden, als sein Geld auf den richtigen Werth reduzirt ward, wie der Werth der Dinge und des Geldes.",
      "*) Titre heisst einerseits Titel, Name, andererseits aber auch, bei Gold und Silber, deren Feingehalt.",
    ]);
  });

  it("reads a centred line of a paragraph sign, a number and a title as a section", async () => {
    const units = parseArchiveOcrWork(
      await readFile(
        join(import.meta.dir, "fixtures", "archive-ocr-star-notes.html"),
        "utf8",
      ),
      {
        item: "ldpd_14861084_000",
        title: "Das Elend der Philosophie",
        citation: "Elend",
        firstPage: 70,
        lastPage: 72,
      },
    );

    expect(units.at(-1)?.title).toBe("§ 2. Der konstituirte Werth.");
  });

  it("reads a numbered section opening a page, however high, as a section", async () => {
    const units = parseArchiveOcrWork(
      await readFile(
        join(import.meta.dir, "fixtures", "archive-ocr-star-notes.html"),
        "utf8",
      ),
      {
        item: "ldpd_14861084_000",
        title: "Das Elend der Philosophie",
        citation: "Elend",
        firstPage: 70,
        lastPage: 73,
      },
    );

    expect(units.at(-1)?.title).toBe(
      "§ 3. Anwendung des Gesetzes der Proportionalität des Werthes.",
    );
  });

  it("sets an appendix beside the chapters, within the part, not under the last chapter", async () => {
    const units = parseArchiveOcrWork(
      await readFile(
        join(import.meta.dir, "fixtures", "archive-ocr-roman-sections.html"),
        "utf8",
      ),
      {
        item: "mehring-nachlass-1",
        title:
          "Differenz der demokritischen und epikureischen Naturphilosophie",
        citation: "Nachlass I",
        firstPage: 71,
        lastPage: 77,
        corrections: [
          {
            page: 76,
            from: "Hrouνοεt hεεαι und πτ%ιμια ποινεια.",
            to: "Ἄτομοι ἀρχαί und ἄτομα στοιχεῖα.",
          },
        ],
      },
    );

    expect(units.at(-1)?.title).toBe("Anhang I.");
    expect(units.at(-1)?.parents).toEqual([
      "Zweiter Theil. Ueber die Differenz der demokritischen und epikureischen Physik im Besonderen.",
    ]);
  });

  it("leaves a quotation below a numbered section's title to the text", async () => {
    const units = parseArchiveOcrWork(
      await readFile(
        join(import.meta.dir, "fixtures", "archive-ocr-star-notes.html"),
        "utf8",
      ),
      {
        item: "ldpd_14861084_000",
        title: "Das Elend der Philosophie",
        citation: "Elend",
        firstPage: 70,
        lastPage: 74,
      },
    );

    expect(units.at(-1)?.title).toBe("§ 4. Konkurrenz und Monopol.");
    expect(units.at(-1)?.paragraphs[0]).toStartWith("„Die Konkurrenz gehört");
  });

  it("joins a word broken at a line's end the OCR marked with ¬", async () => {
    const units = parseArchiveOcrWork(
      await readFile(
        join(import.meta.dir, "fixtures", "archive-ocr-star-notes.html"),
        "utf8",
      ),
      {
        item: "ldpd_14861084_000",
        title: "Das Elend der Philosophie",
        citation: "Elend",
        firstPage: 70,
        lastPage: 75,
      },
    );

    expect(units.at(-1)?.paragraphs.join(" ")).toContain(
      "nach Herrn Proudhon der Werth",
    );
  });

  it("leaves out the notes an editor signed, the author's kept", async () => {
    const units = parseArchiveOcrWork(
      await readFile(
        join(import.meta.dir, "fixtures", "archive-ocr-star-notes.html"),
        "utf8",
      ),
      {
        item: "ldpd_14861084_000",
        title: "Das Elend der Philosophie",
        citation: "Elend",
        firstPage: 76,
        lastPage: 76,
        skipNotesSigned: ["K."],
      },
    );

    expect(units[0]?.paragraphs).toEqual([
      "Der Werth der Dinge ist der Werth der Arbeit und des Geldes, sagt Herr Proudhon.",
      "**) Proudhon, Philosophie de la misère, I, p. 50.",
    ]);
  });
});

describe("parseArchiveOcrWork, notes set apart by space", () => {
  it("reads full lines below a gap in the page's lower half as notes, each indented line opening one", async () => {
    const units = parseArchiveOcrWork(
      await readFile(
        join(import.meta.dir, "fixtures", "archive-ocr-spaced-notes.html"),
        "utf8",
      ),
      {
        item: "theorienberden01marxuoft",
        title: "Theorien über den Mehrwert",
        citation: "Theorien I",
        firstPage: 11,
        lastPage: 12,
        skipNotesSigned: ["K."],
        spacedNotes: true,
      },
    );

    expect(units[0]?.paragraphs).toEqual([
      "Der Handel bringt der Nation einen Überschuß, der den Profit des Landes bildet. Seine Größe steht im Verhältnis zu der Arbeit der Nation und des Landes, wie der Handel selbst.¹ Der Profit der Nation ist der Handel des Landes, und die Arbeit der Nation ist sein Wert.",
      "„Die Arbeit des Landes ist der Wert der Nation und der Profit des Handels.“ (l. c. S. 63.)",
    ]);
  });
});

describe("parseArchiveOcrWork, lettered parts", () => {
  it("reads a lettered title on one line as a part, its numbered sections under it", async () => {
    const units = parseArchiveOcrWork(
      await readFile(
        join(import.meta.dir, "fixtures", "archive-ocr-lettered-parts.html"),
        "utf8",
      ),
      {
        item: "theorienberden01marxuoft",
        title: "Theorien über den Mehrwert",
        citation: "Theorien I",
        firstPage: 1,
        lastPage: 2,
      },
    );

    expect(units.map((unit) => [unit.parents.at(-1), unit.title])).toEqual([
      [
        "A. Die Physiokraten und einige ihrer Vorgänger und Zeitgenossen.",
        "1. Sir William Petty.",
      ],
      [
        "B. Adam Smith und der Begriff der produktiven Arbeit.",
        "1. Seine Bestimmung des Wertes durch die Arbeit.",
      ],
    ]);
  });

  it("reads a section's heading low on the page as a heading, not as notes", async () => {
    const units = parseArchiveOcrWork(
      await readFile(
        join(import.meta.dir, "fixtures", "archive-ocr-spaced-notes.html"),
        "utf8",
      ),
      {
        item: "theorienberden01marxuoft",
        title: "Theorien über den Mehrwert",
        citation: "Theorien I",
        firstPage: 13,
        lastPage: 13,
        spacedNotes: true,
      },
    );

    expect(units.at(-1)?.title).toBe("3. Sir Dudley North und John Locke.");
  });
});

describe("parseArchiveOcrWork, Kautsky's headings", () => {
  it("reads a numbered section under the running head, a wide one that ends as a title, and an appendix with its title", async () => {
    const units = parseArchiveOcrWork(
      await readFile(
        join(import.meta.dir, "fixtures", "archive-ocr-kautsky-heads.html"),
        "utf8",
      ),
      {
        item: "theorienberden01marxuoft",
        title: "Theorien über den Mehrwert",
        citation: "Theorien I",
        firstPage: 66,
        lastPage: 68,
        spacedNotes: true,
      },
    );

    expect(units.map((unit) => unit.title)).toEqual([
      "10. Th. A. H. Schmalz und Graf de Buat.",
      "11. Die für die Zirkulation erheischte Geldmenge.",
      "Anhang zu dem Tableau.",
      "Anhang. Der Begriff der produktiven Arbeit.",
    ]);
  });

  it("reads a roman title on one line after numbered sections as a chapter, numbered by its place, not as an example", async () => {
    const units = parseArchiveOcrWork(
      await readFile(
        join(import.meta.dir, "fixtures", "archive-ocr-lettered-parts.html"),
        "utf8",
      ),
      {
        item: "theorienberden01marxuoft",
        title: "Theorien über den Mehrwert",
        citation: "Theorien I",
        firstPage: 1,
        lastPage: 4,
      },
    );

    expect([units.at(-1)?.parents.at(-1), units.at(-1)?.title]).toEqual([
      "I. Die Grundrente.",
      "1. Rodbertus.",
    ]);
  });

  it("reads a roman title before its first numbered section as a chapter where the volume sets numerals alone", async () => {
    const units = parseArchiveOcrWork(
      await readFile(
        join(import.meta.dir, "fixtures", "archive-ocr-roman-parts.html"),
        "utf8",
      ),
      {
        item: "theorienberden01marxuoft",
        title: "Theorien über den Mehrwert",
        citation: "Theorien I",
        firstPage: 1,
        lastPage: 5,
      },
    );

    expect(
      units
        .filter((unit) => unit.title === "1. Rodbertus.")
        .map((unit) => unit.parents.at(-1)),
    ).toEqual(["I. Die Grundrente."]);
  });

  it("leaves a roman label set smaller than the text, as a table sets it, to the text", async () => {
    const units = parseArchiveOcrWork(
      await readFile(
        join(import.meta.dir, "fixtures", "archive-ocr-roman-parts.html"),
        "utf8",
      ),
      {
        item: "theorienberden01marxuoft",
        title: "Theorien über den Mehrwert",
        citation: "Theorien I",
        firstPage: 1,
        lastPage: 5,
      },
    );

    expect(units.map((unit) => unit.title)).not.toContain("I. Agrikultur.");
  });

  it("leaves out an editor's signed note the page sets as text", async () => {
    const units = parseArchiveOcrWork(
      await readFile(
        join(import.meta.dir, "fixtures", "archive-ocr-spaced-notes.html"),
        "utf8",
      ),
      {
        item: "theorienberden01marxuoft",
        title: "Theorien über den Mehrwert",
        citation: "Theorien I",
        firstPage: 14,
        lastPage: 14,
        spacedNotes: true,
        skipNotesSigned: ["K."],
      },
    );

    expect(units.flatMap((unit) => unit.paragraphs)).toEqual([
      "Der Handel der Nation bringt dem Lande den Profit der Arbeit, wie der Profit des Handels.",
    ]);
  });

  it("reads a running head whose page number the OCR set in superscript", async () => {
    const units = parseArchiveOcrWork(
      await readFile(
        join(import.meta.dir, "fixtures", "archive-ocr-kautsky-heads.html"),
        "utf8",
      ),
      {
        item: "theorienberden01marxuoft",
        title: "Theorien über den Mehrwert",
        citation: "Theorien I",
        firstPage: 66,
        lastPage: 69,
        spacedNotes: true,
      },
    );

    expect(units.flatMap((unit) => unit.paragraphs).join(" ")).not.toContain(
      "6⁹",
    );
  });
});

describe("parseArchiveOcrWork, numbered sections in order", () => {
  it("reads only sections numbered in order, titled without an ornament, and no list's item", async () => {
    const units = parseArchiveOcrWork(
      await readFile(
        join(import.meta.dir, "fixtures", "archive-ocr-section-order.html"),
        "utf8",
      ),
      {
        item: "theorienberden03marxuoft",
        title: "Theorien über den Mehrwert",
        citation: "Theorien III",
        firstPage: 1,
        lastPage: 3,
      },
    );

    expect(units.map((unit) => [unit.parents.at(-1), unit.title])).toEqual([
      ["I. Die Kritik.", "1. Der Wert."],
      ["I. Die Kritik.", "2. Der Mehrwert."],
    ]);
  });

  it("reads an appendix's roman sections set smaller than the text, where space sets them apart", async () => {
    const units = parseArchiveOcrWork(
      await readFile(
        join(import.meta.dir, "fixtures", "archive-ocr-section-order.html"),
        "utf8",
      ),
      {
        item: "theorienberden03marxuoft",
        title: "Theorien über den Mehrwert",
        citation: "Theorien III",
        firstPage: 4,
        lastPage: 4,
      },
    );

    expect(units.map((unit) => [...unit.parents, unit.title])).toEqual([
      ["Anhang.", "I. Proudhon über den Zins."],
      ["Anhang.", "II. Luther über den Wucher."],
    ]);
  });

  it("reads an editor's closing bracket the OCR read as an exclamation mark", async () => {
    const units = parseArchiveOcrWork(
      await readFile(
        join(import.meta.dir, "fixtures", "archive-ocr-section-order.html"),
        "utf8",
      ),
      {
        item: "theorienberden03marxuoft",
        title: "Theorien über den Mehrwert",
        citation: "Theorien III",
        firstPage: 1,
        lastPage: 3,
      },
    );

    expect(units[0]?.paragraphs[0]).toBe(
      "Der Wert der Arbeit ist der Wert [der Ware] und die Kritik der Arbeit, wie der Wert.",
    );
  });
});

describe("parseArchiveOcrWork, datelined articles", () => {
  const articles = async (
    skipHeadings: string[] = [],
  ): Promise<ReturnType<typeof parseArchiveOcrWork>> =>
    parseArchiveOcrWork(
      await readFile(
        join(import.meta.dir, "fixtures", "archive-ocr-articles.html"),
        "utf8",
      ),
      {
        item: "gesammelteschrif02marxuoft",
        title: "Gesammelte Schriften",
        citation: "GS II",
        firstPage: 1,
        lastPage: 3,
        datelined: true,
        skipHeadings,
      },
    );

  it("reads a topic, its articles above their datelines, and an article's numbered parts", async () => {
    const units = await articles();

    expect(units.map((unit) => [...unit.parents, unit.title])).toEqual([
      ["Die Räumung der Donaufürstentümer.", "Reden. — Saint-Arnaud."],
      [
        "Die Räumung der Donaufürstentümer.",
        "Der Stand des russischen Krieges.",
      ],
      ["Die Räumung der Donaufürstentümer.", "Die Belagerung von Silistria."],
      [
        "Die Räumung der Donaufürstentümer.",
        "Zum englischen Militärwesen.",
        "I",
      ],
      [
        "Die Räumung der Donaufürstentümer.",
        "Zum englischen Militärwesen.",
        "II",
      ],
      ["Die Räumung der Donaufürstentümer.", "Die Handelskrise.", "I"],
      ["Die Räumung der Donaufürstentümer.", "Die Handelskrise.", "II"],
    ]);
  });

  it("keeps an article's dateline as its first paragraph", async () => {
    const units = await articles();

    expect(units[0]?.paragraphs[0]).toBe(
      "London, 9. Juni 1854 (New York Tribune, 24. Juni 1854).",
    );
  });

  it("leaves out only the article a title names, not one alike in some words", async () => {
    const units = await articles([
      "Die Desorganisation der englischen Militärverwaltung.",
    ]);

    expect(units.map((unit) => unit.parents.at(-1))).toContain(
      "Zum englischen Militärwesen.",
    );
  });

  it("leaves out an article and its parts by the article's title", async () => {
    const units = await articles([
      "Die Belagerung von Silistria.",
      "Die Handelskrise.",
    ]);

    expect(units.map((unit) => unit.title)).toEqual([
      "Reden. — Saint-Arnaud.",
      "Der Stand des russischen Krieges.",
      "I",
      "II",
    ]);
  });
});

describe("parseArchiveOcrWork, articles opening with their dateline", () => {
  it("opens an article at a paragraph that opens with its dateline, under a group whose title the running heads repeat", async () => {
    const units = parseArchiveOcrWork(
      await readFile(
        join(import.meta.dir, "fixtures", "archive-ocr-nrz.html"),
        "utf8",
      ),
      {
        item: "mehring-nachlass-3",
        title: "Aus dem literarischen Nachlass",
        citation: "Nachlass III",
        firstPage: 95,
        lastPage: 100,
        datelined: true,
      },
    );

    expect(units.map((unit) => [...unit.parents, unit.title])).toEqual([
      ["Das Ministerium Camphausen", "Köln, 3. Juni."],
      ["Das Ministerium Camphausen", "Köln, 13. Juni."],
      ["Die Polendebatte in Frankfurt", "Köln, 7. August."],
      ["Die Polendebatte in Frankfurt", "Köln, im Januar."],
    ]);
    expect(units[0]?.paragraphs).toEqual([
      "** Köln, 3. Juni. Die Zeiten ändern sich, wir ändern uns mit ihnen, und die Herren Camphausen und Hansemann wissen davon zu erzählen.",
    ]);
  });

  it("leaves out an article by its dateline, not another of the month", async () => {
    const units = parseArchiveOcrWork(
      await readFile(
        join(import.meta.dir, "fixtures", "archive-ocr-nrz.html"),
        "utf8",
      ),
      {
        item: "mehring-nachlass-3",
        title: "Aus dem literarischen Nachlass",
        citation: "Nachlass III",
        firstPage: 95,
        lastPage: 100,
        datelined: true,
        skipHeadings: ["Köln, 3. Juni."],
      },
    );

    expect(units.map((unit) => unit.title)).toEqual([
      "Köln, 13. Juni.",
      "Köln, 7. August.",
      "Köln, im Januar.",
    ]);
  });
});
