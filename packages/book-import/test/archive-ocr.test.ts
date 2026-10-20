import { describe, expect, it } from "bun:test";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import {
  pageText,
  parseArchiveOcrWork,
  workPages,
  printedPageNumbers,
  withVolumeReading,
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

  it.each(["² l. c.", "² A. a. O.", "²) l. c."])(
    "keeps a note that only refers back, its mark set in superscript: %s",
    async (note) => {
      const hocr = (await fixture()).replace(
        ">Ferenczi, Abraham, Simmel und E. Jones, 1919.</span>",
        `>Ferenczi, Abraham, Simmel und E. Jones, 1919.</span>\n  <span class='ocr_line' title='bbox 182 4010 700 4070; x_size 60'>${note}</span>`,
      );
      const paragraphs = parseArchiveOcrWork(hocr, {
        ...work,
        notes: [
          { page: 4, opens: "ı) Vgl." },
          { page: 4, opens: note },
        ],
      }).flatMap((unit) => unit.paragraphs);

      expect(paragraphs).toContain(note);
    },
  );

  it("runs a page opening in lower case on the sentence left open above a note read as text", async () => {
    const hocr = (await fixture())
      .replace(
        ">.seits Beschreibung und Rechenschaft zu geben.</span>",
        ">.seits Beschreibung und Rechenschaft zu</span>\n  <span class='ocr_line' title='bbox 180 810 2400 890; x_size 78'>1 Eine Anmerkung. K.</span>",
      )
      .replace(
        /<span class='ocr_line' title='bbox 92 3740[\s\S]*?Jones, 1919\.<\/span>/u,
        "",
      )
      .replace(
        "<span class='ocr_line' title='bbox 220 480 2500 560; x_size 79'>Die Ich-</span>",
        "<span class='ocr_line' title='bbox 130 480 2500 560; x_size 79'>geben, wie man sieht.</span>",
      );
    const paragraphs = parseArchiveOcrWork(hocr, work).flatMap(
      (unit) => unit.paragraphs,
    );

    expect(paragraphs.join("\n")).toContain(
      "Rechenschaft zu geben, wie man sieht.",
    );
    expect(paragraphs).toContain("1 Eine Anmerkung. K.");
  });

  it.each([
    "Freud, XI. ß",
    "Freud, X1. y",
    "Freud, XVI. B",
    "Freud, XI ’",
    "Freud, x1. 22",
    "Freud, XIIE, ri",
    "Freud, X]1t. 14",
    "G Freud XVII",
    "H Freud XVIl",
    "D Freud XVU",
  ])(
    "leaves out Freud's signature whose sheet number the OCR misread: %s",
    async (signature) => {
      const hocr = (await fixture()).replace(
        ">.seits Beschreibung und Rechenschaft zu geben.</span>",
        `>.seits Beschreibung und Rechenschaft zu geben.</span>\n  <span class='ocr_line' title='bbox 180 4250 1400 4300; x_size 50'>${signature}</span>`,
      );
      const paragraphs = parseArchiveOcrWork(hocr, work).flatMap(
        (unit) => unit.paragraphs,
      );

      expect(paragraphs.join("\n")).not.toMatch(/Freud,? ?[XxIVl]/);
    },
  );

  it.each(["Marx-Engels' Schriften. II. 2", "Marx-Engels' Schriften. IJ."])(
    "leaves out a signature that names its book after hyphened authors: %s",
    async (signature) => {
      const hocr = (await fixture()).replace(
        ">.seits Beschreibung und Rechenschaft zu geben.</span>",
        `>.seits Beschreibung und Rechenschaft zu geben.</span>\n  <span class='ocr_line' title='bbox 180 4250 1400 4300; x_size 50'>${signature}</span>`,
      );
      const paragraphs = parseArchiveOcrWork(hocr, work).flatMap(
        (unit) => unit.paragraphs,
      );

      expect(paragraphs.join("\n")).not.toContain("Schriften");
    },
  );

  it("reads a capital umlaut the OCR doubled with its small letter as the capital", async () => {
    const hocr = (await fixture()).replace(
      "Jones, 1919.",
      "Jones, 1919. üÜber das Ich; äÄra.",
    );

    expect(pageText(hocr, 4)).toContain("Jones, 1919. Über das Ich; Ära.");
  });

  it("reads an apostrophe the OCR doubled, straight and curved, as one, and leaves a prime's two strokes", async () => {
    const hocr = (await fixture()).replace(
      "Jones, 1919.",
      "Jones, 1919. qu'’il England’'s B''",
    );

    expect(pageText(hocr, 4)).toContain("Jones, 1919. qu’il England’s B''");
  });

  it.each(["RL Ba ln a EEE", "Sb an rl a a kn a SEE", "Eee EEE EEE EEE"])(
    "leaves out a rule the OCR read as letters, without a word among them: %s",
    async (scraps) => {
      const hocr = (await fixture()).replace(
        ">.seits Beschreibung und Rechenschaft zu geben.</span>",
        `>.seits Beschreibung und Rechenschaft zu geben.</span>\n  <span class='ocr_line' title='bbox 92 3650 1200 3700; x_size 40'>${scraps}</span>`,
      );
      const read = parseArchiveOcrWork(hocr, work)
        .flatMap((unit) => unit.paragraphs)
        .join("\n");

      expect(read).not.toContain(scraps.split(" ")[0]);
      expect(read).toContain("Rechenschaft zu geben.");
    },
  );

  it("keeps a short abbreviation in capitals standing alone, set in from the margin", async () => {
    const hocr = (await fixture()).replace(
      ">.seits Beschreibung und Rechenschaft zu geben.</span>",
      ">.seits Beschreibung und Rechenschaft zu geben.</span>\n  <span class='ocr_line' title='bbox 600 810 800 890; x_size 78'>USW.</span>",
    );
    const read = parseArchiveOcrWork(hocr, work)
      .flatMap((unit) => unit.paragraphs)
      .join("\n");

    expect(read).toContain("USW.");
  });

  it("keeps a citation set alone at the right, though it holds no word", async () => {
    const hocr = (await fixture()).replace(
      ">.seits Beschreibung und Rechenschaft zu geben.</span>",
      ">.seits Beschreibung und Rechenschaft zu geben.</span>\n  <span class='ocr_line' title='bbox 1800 810 2400 890; x_size 78'>(I. c. S. 114, 115.)</span>",
    );
    const paragraphs = parseArchiveOcrWork(hocr, work).flatMap(
      (unit) => unit.paragraphs,
    );

    expect(paragraphs.join("\n")).toContain("(l. c. S. 114, 115.)");
  });

  it("leaves out a running head the scan set a little low, by its page's number", async () => {
    const hocr = (await fixture()).replace(
      "bbox 1500 300 2450 370; x_size 61'>Jenseits des Lustprinzips 5",
      "bbox 1500 452 2450 475; x_size 61'>Jenseits des Lustprinzips 5",
    );
    const paragraphs = parseArchiveOcrWork(hocr, work).flatMap(
      (unit) => unit.paragraphs,
    );

    expect(paragraphs.join("\n")).not.toContain("Lustprinzips 5");
    expect(paragraphs.join("\n")).toContain("Die Ich-Analyse beginnt");
  });

  it("runs a noun opening the page on the sentence left open above a note signed after a quotation", async () => {
    const hocr = (await fixture())
      .replace(
        ">.seits Beschreibung und Rechenschaft zu geben.</span>",
        ">.seits Beschreibung und Rechenschaft zu</span>\n  <span class='ocr_line' title='bbox 180 810 2400 890; x_size 78'>Im Manuskript steht „Gabe“. K.</span>",
      )
      .replace(
        /<span class='ocr_line' title='bbox 92 3740[\s\S]*?Jones, 1919\.<\/span>/u,
        "",
      )
      .replace(
        "<span class='ocr_line' title='bbox 220 480 2500 560; x_size 79'>Die Ich-</span>",
        "<span class='ocr_line' title='bbox 130 480 2500 560; x_size 79'>Rede stehen, wie man sieht.</span>",
      );
    const paragraphs = parseArchiveOcrWork(hocr, work).flatMap(
      (unit) => unit.paragraphs,
    );

    expect(paragraphs.join("\n")).toContain(
      "Rechenschaft zu Rede stehen, wie man sieht.",
    );
    expect(paragraphs).toContain("Im Manuskript steht „Gabe“. K.");
  });

  it("reads a line the manifest names as running on the note before as that note's", async () => {
    const [first] = parseArchiveOcrWork(await fixture(), {
      ...work,
      notes: [{ page: 5, opens: "läuft weiter", runsOn: true }],
    });

    expect(first?.paragraphs.at(-1)).toContain("E. Jones, 1919. läuft weiter");
  });

  it("runs a note on only from the page before, not from a note pages back", async () => {
    const hocr = (await fixture())
      .replace(
        "<span class='ocr_line' title='bbox 86 1920 2400 2000; x_size 78'>wir uns mit der Aufstellung des Lustprinzips einem bestimmten,</span>",
        "<span class='ocr_line' title='bbox 86 1920 2400 2000; x_size 78'>wir uns mit der Aufstellung des Lustprinzips einem bestimmten,</span>\n  <span class='ocr_line' title='bbox 90 3700 700 3712; x_size 10'>————————</span>\n  <span class='ocr_line' title='bbox 182 3760 1200 3810; x_size 50'>¹) Erste Anmerkung.</span>",
      )
      .replace(
        "<span class='ocr_line' title='bbox 182 3870 2400 3930; x_size 60'>ı) Vgl. Zur Psychoanalyse der Kriegsneurosen. Mit Beiträgen von</span>",
        "",
      )
      .replace(
        "<span class='ocr_line' title='bbox 90 3940 2400 4000; x_size 59'>Ferenczi, Abraham, Simmel und E. Jones, 1919.</span>",
        "",
      )
      .replace(
        "<span class='ocr_line' title='bbox 130 3830 2500 3910; x_size 79'>nach unten.</span>",
        "<span class='ocr_line' title='bbox 130 3830 2500 3910; x_size 79'>nach unten.</span>\n  <span class='ocr_line' title='bbox 90 4000 700 4012; x_size 10'>————————</span>\n  <span class='ocr_line' title='bbox 182 4060 1400 4110; x_size 50'>fortgesetzt von einer anderen Seite.</span>",
      );
    const [first] = parseArchiveOcrWork(hocr, work);

    expect(first?.paragraphs).toContain("¹) Erste Anmerkung.");
    expect(first?.paragraphs).toContain("fortgesetzt von einer anderen Seite.");
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

describe("parseArchiveOcrWork on a work that opens mid-page", () => {
  it("reads its first page from the line it opens with, after another's end", async () => {
    const units = parseArchiveOcrWork(await fixture(), {
      ...work,
      opensWith: "Es hat dabei für uns",
    });
    const text = units.flatMap((unit) => unit.paragraphs).join("\n");

    expect(units[0]?.paragraphs[0]).toStartWith(
      "Es hat dabei für uns kein Interesse",
    );
    expect(text).not.toContain("In der psychoanalytischen Theorie");
  });

  it("corrects any line of its first page, the one it opens with too", async () => {
    const hocr = (await fixture()).replace(
      ">Es hat dabei für uns kein Interesse,",
      ">Es hat dahei für uns kein Interesse,",
    );
    const units = parseArchiveOcrWork(hocr, {
      ...work,
      opensWith: "Es hat dabei für uns",
      corrections: [
        {
          page: 3,
          from: "In der psychoanalytischen Theorie nehmen",
          to: "In der psychoanalytischen Theorie, nehmen",
        },
        { page: 3, from: "Es hat dahei für uns", to: "Es hat dabei für uns" },
      ],
    });
    const text = units.flatMap((unit) => unit.paragraphs).join("\n");

    expect(units[0]?.paragraphs[0]).toStartWith(
      "Es hat dabei für uns kein Interesse",
    );
    expect(text).not.toContain("psychoanalytischen Theorie");
  });

  it("opens with the line a correction leaves out, as a title the manifest gives", async () => {
    const units = parseArchiveOcrWork(await fixture(), {
      ...work,
      opensWith: "Es hat dabei für uns",
      corrections: [
        {
          page: 3,
          from: "Es hat dabei für uns kein Interesse, zu untersuchen, inwieweit",
          to: "",
        },
      ],
    });
    const text = units.flatMap((unit) => unit.paragraphs).join("\n");

    expect(text).not.toContain("psychoanalytischen Theorie");
    expect(text).not.toContain("kein Interesse");
  });

  it("stops on an opening line its first page does not hold", async () => {
    const hocr = await fixture();

    expect(() =>
      parseArchiveOcrWork(hocr, { ...work, opensWith: "Nicht da" }),
    ).toThrow('No line opening "Nicht da" on page 3');
  });
});

describe("parseArchiveOcrWork on notes set to another's text", () => {
  it("keeps the notes alone, each under the passage it is set to", async () => {
    const units = parseArchiveOcrWork(await fixture(), {
      ...work,
      notesOnly: true,
    });

    expect(units.map((unit) => [unit.title, unit.page])).toEqual([
      [
        "Es hat dabei für uns kein Interesse, zu untersuchen, inwieweit wir uns mit der Aufstellung des Lustprinzips einem bestimmten, historisch festgelegten System angenähert haben.",
        "GW XIII, 4",
      ],
    ]);
    expect(units[0]?.paragraphs).toEqual([
      "¹) Vgl. Zur Psychoanalyse der Kriegsneurosen. Mit Beiträgen von Ferenczi, Abraham, Simmel und E. Jones, 1919.",
    ]);
  });

  it("finds a note's passage in the section before, where a heading falls between", async () => {
    const units = parseArchiveOcrWork(await fixture(), {
      ...work,
      notesOnly: true,
      headings: [{ page: 4, opens: "zu solchen Annahmen", level: 1 }],
    });

    expect(units.map((unit) => unit.title)).toEqual([
      "Es hat dabei für uns kein Interesse, zu untersuchen, inwieweit wir uns mit der Aufstellung des Lustprinzips einem bestimmten, historisch festgelegten System angenähert haben.",
    ]);
  });

  it("finds no notes but those the manifest names, where it names them all", async () => {
    expect(
      parseArchiveOcrWork(await fixture(), {
        ...work,
        notesOnly: true,
        notesNamed: true,
      }),
    ).toEqual([]);
    expect(
      parseArchiveOcrWork(await fixture(), {
        ...work,
        notesOnly: true,
        notesNamed: true,
        notes: [{ page: 4, opens: "ı) Vgl. Zur" }],
      }),
    ).toHaveLength(1);
  });

  it("keeps only the notes signed as the manifest names", async () => {
    const units = parseArchiveOcrWork(await fixture(), {
      ...work,
      notesOnly: true,
      notesSigned: ["Anmerkung des Übersetzers."],
    });

    expect(units).toEqual([]);
  });
});

describe("parseArchiveOcrWork on a work that closes mid-page", () => {
  it("reads its last page up to the line it closes with, before another begins", async () => {
    const units = parseArchiveOcrWork(await fixture(), {
      ...work,
      closesWith: "Ein volles Verständnis",
    });
    const text = units.flatMap((unit) => unit.paragraphs).join("\n");

    expect(text).toContain("Ein volles Verständnis ist bisher");
    expect(text).not.toContain("nicht erzielt worden");
  });

  it("stops on a closing line its last page does not hold", async () => {
    const hocr = await fixture();

    expect(() =>
      parseArchiveOcrWork(hocr, { ...work, closesWith: "Nicht da" }),
    ).toThrow('No line opening "Nicht da" on page 10');
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

describe("parseArchiveOcrWork on a page whose paragraphs the manifest names", () => {
  it("opens a paragraph at the lines it names on that page, and at no other", async () => {
    const units = parseArchiveOcrWork(await fixture(), {
      ...work,
      paragraphs: [
        { page: 5, opens: "Ein Satz" },
        { page: 5, opens: "läuft weiter" },
      ],
    });

    expect(units[0]?.paragraphs.slice(1, 4)).toEqual([
      "Es hat dabei für uns kein Interesse, zu untersuchen, inwieweit wir uns mit der Aufstellung des Lustprinzips einem bestimmten, historisch festgelegten System angenähert haben.¹) Wir gelangen zu solchen Annahmen bei dem Bemühen, von den Tatsachen einerseits Beschreibung und Rechenschaft zu geben. Die Ich-Analyse beginnt hier.",
      "Ein Satz unten auf der Seite",
      "läuft weiter, und am Rand rutscht ein Wort nach unten.",
    ]);
  });
});

/** One page's paragraph of lines, read as a work. */
const paragraphOf = (lines: string[]): string => {
  const page = (leaf: number): string =>
    `<div class='ocr_page' id='page_${leaf}' title='bbox 0 0 3300 5300'><span class='ocr_pageno'>${leaf + 1}</span>
 <p class='ocr_par'>${lines
   .map(
     (text, index) =>
       `<span class='ocr_line' title='bbox ${index === 0 ? 400 : 300} ${1000 + index * 90} 3000 ${1080 + index * 90}; x_size 70'>${text}</span>`,
   )
   .join("\n")}</p>
</div>`;
  return parseArchiveOcrWork(`<html><body>${page(0)}</body></html>`, {
    item: "dash",
    title: "Dash",
    citation: "D",
    firstPage: 1,
    lastPage: 1,
  })
    .flatMap((unit) => unit.paragraphs)
    .join("\n");
};

describe("parseArchiveOcrWork, a dash at a line's end", () => {
  it("joins a dash set close to its word to the next line's word, where the work sets its dashes so", () => {
    expect(
      paragraphOf([
        "The operations—which had begun in May—were",
        "renewed in the autumn of that year, and were",
        "carried on with vigor—",
        "one by one the forts fell.",
      ]),
    ).toContain("carried on with vigor—one by one");
  });

  it("sets a dash apart from both words, where the work sets its dashes apart", () => {
    expect(
      paragraphOf([
        "Die Lage war schwierig — doch wir gingen weiter",
        "und kamen — trotz allem — bald an das Ziel",
        "unserer Reise, wie es geplant war—",
        "und blieben dort lange Zeit.",
      ]),
    ).toContain("wie es geplant war — und blieben");
  });
});

describe("parseArchiveOcrWork, a line at a body page's head opening with I", () => {
  it("keeps the line and the lines above it, no roman running head", () => {
    expect(
      paragraphOf([
        "of the patient, as we shall see in what follows.",
        "I wish to expound in a few words what the term",
        "has come to mean in Psycho-analysis alone.",
      ]),
    ).toBe(
      "of the patient, as we shall see in what follows. I wish to expound in a few words what the term has come to mean in Psycho-analysis alone.",
    );
  });

  it("reads the page's first line, its number misread as I, as its running head", () => {
    expect(
      paragraphOf([
        "der Starre nach Little. I",
        "der cerebralen Kinderlähmung angeführt haben (siehe unten).",
      ]),
    ).toBe("der cerebralen Kinderlähmung angeführt haben (siehe unten).");
  });
});

describe("parseArchiveOcrWork, straight quotes set apart from their words", () => {
  it("closes a paragraph's quotes on the words they quote", () => {
    expect(
      paragraphOf([
        "I wish to expound what the term &quot; unconscious &quot; has come",
        "to mean. The first stage is the &quot; negative &quot; ; we designate",
        "it by the name &quot; The Unconscious,&quot; for want of a better term.",
      ]),
    ).toBe(
      'I wish to expound what the term "unconscious" has come to mean. The first stage is the "negative" ; we designate it by the name "The Unconscious," for want of a better term.',
    );
  });

  it("leaves a paragraph whose quotes do not pair, a quotation running on from the one before", () => {
    // The lines as hOCR sets them, their quotes encoded.
    const lines = ["the word &quot; unconscious and", "what follows it."];
    expect(paragraphOf(lines)).toBe(
      'the word " unconscious and what follows it.',
    );
  });

  it("leaves a paragraph whose quotes pair in number but not in place, one quotation ending and another opening", () => {
    expect(
      paragraphOf([
        "as developed in his dialogue.&quot; It impresses upon the",
        "Government that &quot; the Emperor would on no account",
      ]),
    ).toBe(
      'as developed in his dialogue." It impresses upon the Government that " the Emperor would on no account',
    );
  });
});

describe("parseArchiveOcrWork, a numeral that opens a paragraph", () => {
  it("keeps the numeral of a paragraph that fills the column, a list's in the text", () => {
    const lines = [
      "Citizens,—The General Council of the Association consider it their duty to",
      "communicate publicly to you evidence on the conduct, during the French",
      "Civil War, of Mr. Washburne, the American Ambassador.",
      "I. The following statement is made by Mr. Robert Reid, a Scotchman who",
      "has lived for seventeen years in Paris, and acted during the Civil War as a",
      "correspondent for the London Daily Telegraph and the New York Herald.",
    ];
    const page = `<div class='ocr_page' id='page_0' title='bbox 0 0 3300 5300'><span class='ocr_pageno'>1</span>
 <p class='ocr_par'>${lines
   .map(
     (text, index) =>
       `<span class='ocr_line' title='bbox ${index === 0 || index === 3 ? 400 : 300} ${1000 + index * 90} 3000 ${1080 + index * 90}; x_size 70'>${text}</span>`,
   )
   .join("\n")}</p>
</div>`;
    const units = parseArchiveOcrWork(`<html><body>${page}</body></html>`, {
      item: "numeral",
      title: "Numeral",
      citation: "N",
      firstPage: 1,
      lastPage: 1,
    });

    expect(units.flatMap((unit) => unit.paragraphs)).toEqual([
      "Citizens,—The General Council of the Association consider it their duty to communicate publicly to you evidence on the conduct, during the French Civil War, of Mr. Washburne, the American Ambassador.",
      "I. The following statement is made by Mr. Robert Reid, a Scotchman who has lived for seventeen years in Paris, and acted during the Civil War as a correspondent for the London Daily Telegraph and the New York Herald.",
    ]);
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

  it("lets a later correction fix what an earlier one wrote", async () => {
    const units = parseArchiveOcrWork(await fixture(), {
      ...work,
      corrections: [
        { page: 5, from: "rutscht ein", to: "ruckt ein" },
        { page: 5, from: "Rand ruckt", to: "Rand rückt" },
      ],
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

  it("gives a line the lines the OCR lost below it, where a whole line's correction holds several", async () => {
    const units = parseArchiveOcrWork(await fixture(), {
      ...work,
      corrections: [
        {
          page: 5,
          from: "Ein Satz unten auf der Seite",
          to: "Ein Satz unten auf der Seite\nund eine verlorene Zeile\nund noch eine",
        },
      ],
      paragraphs: [
        { page: 5, opens: "Ein Satz" },
        { page: 5, opens: "und eine" },
        { page: 5, opens: "und noch" },
      ],
    });

    expect(units[0]?.paragraphs.slice(2, 5)).toEqual([
      "Ein Satz unten auf der Seite",
      "und eine verlorene Zeile",
      "und noch eine läuft weiter, und am Rand rutscht ein Wort nach unten.",
    ]);
  });

  it("reads a table's row read from the scan as text, however it opens and wherever it stands", async () => {
    const units = parseArchiveOcrWork(await fixture(), {
      ...work,
      corrections: [{ page: 3, from: "I", to: "I | 100 | 60" }],
      paragraphs: [
        { page: 3, opens: "I |" },
        { page: 3, opens: "In der psychoanalytischen" },
        { page: 3, opens: "Es hat dabei" },
      ],
    });

    expect(units[0]?.paragraphs[0]).toBe(
      "|  |  |  |\n| --- | --- | --- |\n| I | 100 | 60 |",
    );
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

  it("takes a speck below the page middle for no rule, so the smaller text below it stays text", async () => {
    const hocr = (await fixture()).replace(
      "<span class='ocr_line' title='bbox 130 3710 2300 3815; x_size 66'>",
      "<span class='ocr_line' title='bbox 2585 3690 2598 3705; x_size 20'>*</span>\n  <span class='ocr_line' title='bbox 130 3710 2300 3815; x_size 66'>",
    );
    const units = parseArchiveOcrWork(hocr, work);

    expect(units.flatMap((unit) => unit.paragraphs).join("\n")).toContain(
      "Ein Satz unten auf der Seite läuft weiter",
    );
  });

  it("reads a year the OCR set in letters as figures", async () => {
    const hocr = (await fixture()).replace(
      "Jones, 1919.",
      "Jones, igog, 190g, igoi, 18gi, 188g und ig19; ig, iglu.",
    );

    expect(pageText(hocr, 4)).toContain(
      "Jones, 1909, 1909, 1901, 1891, 1889 und 1919; ig, iglu.",
    );
  });

  it("reads a year the OCR set with a g between its figures", async () => {
    const hocr = (await fixture()).replace(
      "Jones, 1919.",
      "Jones, 18g91, Ende 18g92 und I, 19g13, ig918. ig119, ig111) ig235; 1g, 17g01; um ii Uhr, ig Jahre, io Tage, die ii.",
    );

    expect(pageText(hocr, 4)).toContain(
      "Jones, 1891, Ende 1892 und I, 1913, 1918. 1919, 1911) ig235; 1g, 17g01; um 11 Uhr, 19 Jahre, 10 Tage, die ii.",
    );
  });

  it("reads loco citato and a page the OCR set as 1. c. and p- as l. c. and p.", async () => {
    const hocr = (await fixture()).replace(
      "Jones, 1919.",
      "Jones, 1. c., p- 270; 1.c. p- XLV; 1. Teil, 21. c., Typ- 3.",
    );

    expect(pageText(hocr, 4)).toContain(
      "Jones, l. c., p. 270; l.c. p. XLV; 1. Teil, 21. c., Typ- 3.",
    );
  });

  it("reads a double hyphen standing before a figure as an equals sign, before a word as a ditto mark", async () => {
    const hocr = (await fixture()).replace(
      "Jones, 1919.",
      "Jones, 5 + 10 ⸗ 15; ½ ⸗ Thee; Ver⸗",
    );

    expect(pageText(hocr, 4)).toContain("Jones, 5 + 10 = 15; ½ ⸗ Thee; Ver⸗");
  });

  it("reads a double hyphen inside a word as a hyphen, at the line's end as its break", async () => {
    const hocr = (await fixture()).replace(
      "Jones, 1919.",
      "Jones, (N. O.⸗Z., 1855), 10⸗, 20fache, (Netto-⸗) Ver⸗",
    );

    expect(pageText(hocr, 4)).toContain(
      "Jones, (N. O.-Z., 1855), 10-, 20fache, (Netto-) Ver⸗",
    );
  });

  it("leaves out an umlaut standing alone, a speck the facing page left", async () => {
    const hocr = (await fixture()).replace(
      "Jones, 1919.",
      "ö Jones, 1919. ů böse ö",
    );

    expect(pageText(hocr, 4)).toContain("Jones, 1919. böse");
    expect(pageText(hocr, 4)).not.toMatch(/(?<![\p{L}])[öů](?![\p{L}])/u);
  });

  it("leaves out an underscore standing alone, a speck", async () => {
    const hocr = (await fixture()).replace(
      "Jones, 1919.",
      "_ Jones, daß _ der, Völkern, __ Reichen, so diesmal _",
    );

    expect(pageText(hocr, 4)).toContain(
      "Jones, daß der, Völkern, Reichen, so diesmal",
    );
  });

  it("leaves out letters the facing page showed through between words, one letter over and over", async () => {
    const hocr = (await fixture()).replace(
      "Jones, 1919.",
      "Jones, nach EEE Hause, ee nn RR, S. 12 ff., pp. 3.",
    );

    expect(pageText(hocr, 4)).toContain("Jones, nach Hause, S. 12 ff., pp. 3.");
  });

  it("keeps a word's end that opens a line, though it reads like a misread word", async () => {
    const hocr = (await fixture()).replace(
      "Analyse beginnt .hier.",
      "sel‘, das Traumbuch.",
    );

    expect(pageText(hocr, 5)).toContain("sel‘, das Traumbuch.");
  });

  it("reads the italic Vbw and W, Ich, β), Zoë and daß the OCR misread", async () => {
    const hocr = (await fixture()).replace(
      "Jones, 1919.",
      "Jones, das Ybw, /bw, 7bw und Fbw, latenten YDw, solche vdw, System W#-Bw und W# als, dem lIchideal; ß) In, bei Krau ß), daß; Zo& Bertgang, Zo6&, Zo@, Zo£ und Zoë@; dab er, dal das, dal3 sie, dab „der, Dal Monte; er mub, dab",
    );

    expect(pageText(hocr, 4)).toContain(
      "Jones, das Vbw, Vbw, Vbw und Vbw, latenten Vbw, solche vbw, System W-Bw und W als, dem Ichideal; β) In, bei Krau ß), daß; Zoë Bertgang, Zoë, Zoë, Zoë und Zoë; daß er, daß das, daß sie, daß „der, Dal Monte; er muß, daß",
    );
  });

  it("reads W read as a backslash and V, a backslash before a word, Es read as Fs, und and wir misread", async () => {
    const hocr = (await fixture()).replace(
      "Jones, 1919.",
      "Jones, \\Vie Sie wissen, \\nur so. \\Wenn die \\WViederkehr, \\Fuß und Ges. \\Werke; Fs gibt Kunst nnd Sprache uud wif; er sel ünd äus, zü, äuf äb äls.",
    );

    expect(pageText(hocr, 4)).toContain(
      "Jones, Wie Sie wissen, nur so. Wenn die Wiederkehr, Fuß und Ges. Werke; Es gibt Kunst und Sprache und wir; er sei und aus, zu, auf ab als.",
    );
  });

  it("leaves out a backslash standing alone, a pencil mark, and reads one before a bracket as a note", async () => {
    const hocr = (await fixture()).replace(
      "Jones, 1919.",
      "\\ Jones, 1919. \\ und \\ \\) Über",
    );

    expect(pageText(hocr, 4)).toContain("Jones, 1919. und ¹) Über");
    expect(pageText(hocr, 4)).not.toContain("\\");
  });

  it("reads dgl. and an initial O the OCR set without their stop or with a zero, and Sch split from its word", async () => {
    const hocr = (await fixture()).replace(
      "Jones, 1919.",
      "Jones, Melonen u. dgl, um; u. dgl m.; u. dgl. so; Anna O0. und O0. Rank; Dgl, O0.5. Sch wierigkeiten, Sch wester.",
    );

    expect(pageText(hocr, 4)).toContain(
      "Jones, Melonen u. dgl., um; u. dgl. m.; u. dgl. so; Anna O. und O. Rank; Dgl, O0.5. Schwierigkeiten, Schwester.",
    );
  });

  it("reads loco citato the OCR set in capitals as l. c., not a name's initials", async () => {
    const hocr = (await fixture()).replace(
      "Jones, 1919.",
      "Jones, I. c. S. 1; I. C. S. 2; l. C. S. 3; J. c. S. 4; 1. C. S. 5; J. C. L. Sismondi.",
    );

    expect(pageText(hocr, 4)).toContain(
      "Jones, l. c. S. 1; l. c. S. 2; l. c. S. 3; l. c. S. 4; l. c. S. 5; J. C. L. Sismondi.",
    );
  });

  it("reads a quotation mark the OCR set as two single ones as one double", async () => {
    const hocr = (await fixture()).replace(
      "Jones, 1919.",
      "Jones, ‚‚Sinn‘‘ und ‚Wort‘, (,,So 1, 2, 1919.",
    );

    expect(pageText(hocr, 4)).toContain(
      "Jones, „Sinn“ und ‚Wort‘, („So 1, 2, 1919.",
    );
  });

  it("reads a quotation the OCR closed with a single mark as closed with a double one", async () => {
    const hocr = (await fixture()).replace(
      "Jones, 1919.",
      "Jones, „Totem und Tabu‘ und „Angst‘, ein „Besseren‘ geben!“, „nicht ‘den und ‚Wort‘, dem Wort ‚„Asien‘ hinzu.",
    );

    expect(pageText(hocr, 4)).toContain(
      "Jones, „Totem und Tabu“ und „Angst“, ein „Besseren‘ geben!“, „nicht ‘den und ‚Wort‘, dem Wort ‚„Asien‘ hinzu.",
    );
  });

  it("reads a first the OCR set as i before a month or a volume's part as 1", async () => {
    const hocr = (await fixture()).replace(
      "Jones, 1919.",
      "Jones, i. Mai 1919, i. Aufl., i. Teil; d. i. Mai.",
    );

    expect(pageText(hocr, 4)).toContain(
      "Jones, 1. Mai 1919, 1. Aufl., 1. Teil; d. i. Mai.",
    );
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

  it("keeps a title cased as the text spells it where the running heads repeat it in capitals", async () => {
    const hocr = (await headings())
      .replace("Die Traumzensur 6</span>", "DIE TRAUMZENSUR 6</span>")
      .replace(
        /<p class='ocr_par'><span class='ocr_line'[^>]*>\(Fortsetzung\)<\/span><\/p>/u,
        "",
      );

    expect(hocr).toContain("DIE TRAUMZENSUR 6");
    expect(hocr).not.toContain("(Fortsetzung)");
    expect(
      parseArchiveOcrWork(hocr, lectures).map((unit) => unit.title),
    ).toContain("II. Die Traumzensur");
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

describe("parseArchiveOcrWork, a title its running heads misread", () => {
  /** A page of text, its running head above it and its lines below. */
  const page = (leaf: number, head: string, lines: string[]): string =>
    `<div class='ocr_page' id='page_${String(leaf).padStart(6, "0")}' title='bbox 0 0 2400 3800'>
 <p class='ocr_par'><span class='ocr_line' title='bbox 400 200 2000 270; x_size 62'>${head}</span></p>
 <p class='ocr_par'>${lines
   .map(
     (text, line) =>
       `<span class='ocr_line' title='bbox ${line % 3 === 0 ? 330 : 245} ${500 + line * 100} 2150 ${580 + line * 100}; x_size 78'>${text}</span>`,
   )
   .join("\n")}</p>
</div>`;
  const text = [
    "Die Krankheit der Kinder hat man lange nicht gekannt, und",
    "die Aerzte haben die cerebralen Lähmungen der Kinder mit",
    "den Lähmungen der Erwachsenen verwechselt, bis man sie sah.",
    "Die eerebralen Formen der Lähmung sind bei Kindern häufig.",
    "Die Geschichte der Kinderlähmung ist lang, wie man sieht.",
  ];
  /** The chapter set in the text's type on its first page, its title as printed. */
  const opening = (title: string): string =>
    `<div class='ocr_page' id='page_000010' title='bbox 0 0 2400 3800'>
 <p class='ocr_par'><span class='ocr_line' title='bbox 500 400 1900 480; x_size 78'>${title}</span></p>
 <p class='ocr_par'>${text
   .map(
     (line, at) =>
       `<span class='ocr_line' title='bbox ${at % 3 === 0 ? 330 : 245} ${600 + at * 100} 2150 ${680 + at * 100}; x_size 78'>${line}</span>`,
   )
   .join("\n")}</p>
</div>`;
  const hocr = (
    title: string,
    head = "Geschichte der eerebralen Kinderlähmung.",
  ): string =>
    `<html><body>${opening(title)}${[11, 12, 13]
      .map((leaf) =>
        page(
          leaf,
          leaf % 2 === 0 ? `${leaf - 9} ${head}` : `${head} ${leaf - 9}`,
          text,
        ),
      )
      .join("")}</body></html>`;
  const work = {
    item: "halbseitige",
    title: "Klinische Studie",
    citation: "Halbseitige",
    firstPage: 1,
    lastPage: 4,
  };

  it("titles a chapter by its heading as corrected, not by the heads that misread it", () => {
    const units = parseArchiveOcrWork(
      hocr("Geschichte der eerebralen Kinderlähmung."),
      {
        ...work,
        headings: [{ page: 1, opens: "Geschichte der cerebralen" }],
        corrections: [
          {
            page: 1,
            from: "Geschichte der eerebralen Kinderlähmung.",
            to: "Geschichte der cerebralen Kinderlähmung.",
          },
        ],
      },
    );

    expect(units.map((unit) => unit.title)).toEqual([
      "I. Geschichte der cerebralen Kinderlähmung.",
    ]);
  });

  it("takes the case of a heading set in capitals from its running head, though the OCR read a capital small", () => {
    const units = parseArchiveOcrWork(
      hocr(
        "GESCHICHTE DER CEREBRALEN KINDERLäHMUNG",
        "Geschichte der Cerebralen Kinderlähmung.",
      ),
      work,
    );

    expect(units.map((unit) => unit.title)).toEqual([
      "Geschichte der Cerebralen Kinderlähmung.",
    ]);
  });

  it("titles a chapter whose heading the OCR could not read by its running head, as corrected", () => {
    const units = parseArchiveOcrWork(
      hocr("GESCHICHTE DER GEREBRALFN KINDERLAHMUNG"),
      {
        ...work,
        corrections: [
          {
            page: 3,
            from: "3 Geschichte der eerebralen Kinderlähmung.",
            to: "3 Geschichte der cerebralen Kinderlähmung.",
          },
        ],
      },
    );

    expect(units.map((unit) => unit.title)).toEqual([
      "Geschichte der cerebralen Kinderlähmung.",
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

  it("opens a heading the manifest names on a roman page", async () => {
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
        lastPage: "VI",
        headings: [{ page: "VI", opens: "Der Traum ist das erste Glied" }],
      },
    );

    expect(units.map((unit) => unit.section)).toEqual([
      "GW II/III, V",
      "GW II/III, VI",
    ]);
  });

  it("titles a heading the manifest names by its level alone as the edition sets it", async () => {
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
        lastPage: "VI",
        headings: [
          {
            page: "VI",
            opens: "Der Traum ist das erste Glied",
            level: 1,
          },
        ],
      },
    );

    expect(units[1]?.title).toStartWith("Der Traum ist das erste Glied");
  });

  it("titles a section by the headword the manifest names, its line kept as text", async () => {
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
        lastPage: "VI",
        headings: [
          {
            page: "VI",
            opens: "Der Traum ist das erste Glied",
            title: "Der Traum",
          },
        ],
      },
    );

    expect(units[1]?.title).toBe("Der Traum");
    expect(units[1]?.paragraphs[0]).toStartWith(
      "Der Traum ist das erste Glied",
    );
  });

  it("ends a work within the front matter at a roman page", async () => {
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
        lastPage: "VI",
      },
    );

    expect(units.map((unit) => [unit.title, unit.section])).toEqual([
      ["Vorbemerkung", "GW II/III, V"],
    ]);
  });
});

describe("workPages", () => {
  it("lists a work's printed pages in reading order, the front matter's by their roman numbers", async () => {
    const hocr = await readFile(
      join(import.meta.dir, "fixtures", "archive-ocr-front.html"),
      "utf8",
    );

    expect(
      workPages(hocr, { firstPage: "V", lastPage: 3, skipPages: [2] }),
    ).toEqual(["V", "VI", "VII", 1, 3]);
    expect(
      workPages(hocr, { firstPage: "V", lastPage: "VI", skipPages: [] }),
    ).toEqual(["V", "VI"]);
    expect(pageText(hocr, "V")).toContain(
      "Indem ich hier die Darstellung der Traumdeutung versuche",
    );
  });

  it("names the front matter's pages from the one the scan's reading states as page I, where the edition prints no roman numbers", () => {
    const page = (leaf: number, pageno: string, text: string): string =>
      `<div class='ocr_page' id='page_${leaf}' title='bbox 0 0 3300 5300'>${pageno ? `<span class='ocr_pageno'>${pageno}</span>` : ""}
 <p class='ocr_par'><span class='ocr_line' title='bbox 300 1400 3000 1480; x_size 70'>${text}</span></p>
</div>`;
    const hocr = `<html><body>${page(0, "I", "ZUR AUFFASSUNG DER APHASIEN")}${page(1, "", "Herrn Dr. Josef Breuer in freundschaftlicher Verehrung gewidmet.")}${page(2, "1", "Die Lehre von der Aphasie hat in den letzten Jahren")}${page(3, "2", "eine bedeutende Förderung erfahren und manches mehr")}</body></html>`;

    expect(
      workPages(hocr, { firstPage: "II", lastPage: 2, skipPages: [] }),
    ).toEqual(["II", 1, 2]);
    expect(pageText(hocr, "II")).toContain("freundschaftlicher Verehrung");
  });

  it("numbers a page by the page number the scan's reading gives it, where its head reads as noise", () => {
    const page = (leaf: number, head: string): string =>
      `<div class='ocr_page' id='page_${leaf}' title='bbox 0 0 3300 5300'><span class='ocr_pageno'>${leaf + 10}</span>
 <p class='ocr_par'><span class='ocr_line' title='bbox 1500 200 1800 280; x_size 60'>${head}</span>
 <span class='ocr_line' title='bbox 300 400 3000 480; x_size 70'>le nom de communisme à ce qu'ils appelaient autrefois le jaco-</span></p>
</div>`;
    const hocr = `<html><body>${page(0, "ds 14 0")}${page(1, "— 0.")}${page(2, "_3 4")}</body></html>`;

    expect(
      workPages(hocr, { firstPage: 10, lastPage: 12, skipPages: [] }),
    ).toEqual([10, 11, 12]);
    expect(
      workPages(`<html><body>${page(0, "ds 14 0")}</body></html>`, {
        firstPage: 10,
        lastPage: 10,
        skipPages: [],
      }),
    ).toEqual([10]);
  });
});

describe("pageText, a page whose number the scan states", () => {
  it("reads a line of text that opens with a number as text, not as the page's running head", () => {
    const line = (y: number, text: string): string =>
      `<span class='ocr_line' title='bbox 100 ${y} 2000 ${y + 60}; x_size 60'>${text}</span>`;
    const hocr = `<html><body><div class='ocr_page' id='page_0' title='bbox 0 0 2100 3300'><span class='ocr_pageno'>246</span>
 <p class='ocr_par'>${line(40, "Eine Aetherinjektion stellte den Kornealreflex für kurze Zeit")}
 ${line(110, "wieder her.")}</p>
 <p class='ocr_par'>${line(190, "Um 7 Uhr wurde die Beobachtung des Kranken abgebrochen.")}
 ${line(260, "Tod ohne Konvulsionen um 8 Uhr Abends. Es schien die Dia-")}
 ${line(330, "gnose gerechtfertigt: Scorbutus, Hæmorrhagia cerebri intermeninge-")}</p>
</div></body></html>`;

    expect(pageText(hocr, 246)).toStartWith(
      "Eine Aetherinjektion stellte den Kornealreflex für kurze Zeit",
    );
    expect(pageText(hocr, 246)).toContain(
      "Um 7 Uhr wurde die Beobachtung des Kranken abgebrochen.",
    );
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

  it("keeps every number the scan states, however far the pages lie apart", () => {
    const stated = (leaf: number, head: number): LeafReading => ({
      leaf,
      head,
      stated: true,
      words: 300,
    });
    const pages = printedPageNumbers([
      stated(0, 105),
      stated(1, 106),
      stated(2, 424),
      stated(3, 112),
      stated(4, 15),
    ]);

    expect([0, 1, 2, 3, 4].map((leaf) => pages.get(leaf))).toEqual([
      105, 106, 424, 112, 15,
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

  it("counts no plate for leaves left out as rescans, which the pages skip", () => {
    const pages = printedPageNumbers([
      text(10, 1),
      text(11, 2),
      text(12, null),
      // Leaves 13 and 14 scanned 11 and 12 again.
      text(15, null),
      text(16, 5),
      text(17, 6),
    ]);

    expect([12, 15, 16].map((leaf) => pages.get(leaf))).toEqual([3, 4, 5]);
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

  /** A folded table's part, scanned across the leaf, its cells read as words. */
  const across = (leaf: number): LeafReading => ({
    leaf,
    head: null,
    words: 260,
    across: true,
  });
  /** A page that opens a chapter: no running head, a full page of text. */
  const opening = (leaf: number): LeafReading => text(leaf, null);

  it("numbers the pages either side of a table folded over ten leaves, its leaves unnumbered", () => {
    // Pages 37–40, the table's title on 41 and its blank back 42, five
    // folds each scanned across with their blank backs, then 43 opening a
    // chapter and 44–47.
    const pages = printedPageNumbers([
      ...[37, 38, 39, 40].map((page) => text(page + 9, page)),
      { leaf: 50, head: null, words: 4 },
      plate(51),
      ...[52, 54, 56, 58, 60].flatMap((leaf) => [
        across(leaf),
        { leaf: leaf + 1, head: null, words: 0 },
      ]),
      opening(62),
      ...[44, 45, 46, 47].map((page) => text(page + 19, page)),
    ]);

    expect(
      Array.from({ length: 63 - 46 }, (_, index) => pages.get(46 + index)),
    ).toEqual([
      37,
      38,
      39,
      40,
      41,
      42,
      ...Array.from({ length: 10 }, () => null),
      43,
    ]);
  });

  it("numbers the first pages before a folded table from the heads before it", () => {
    const pages = printedPageNumbers([
      opening(10),
      ...Array.from({ length: 30 }, (_, index) => text(11 + index, 2 + index)),
      { leaf: 41, head: null, words: 4 },
      plate(42),
      ...[43, 45, 47, 49, 51].flatMap((leaf) => [
        across(leaf),
        plate(leaf + 1),
      ]),
      opening(53),
      ...[35, 36, 37].map((page) => text(page + 19, page)),
    ]);

    expect([10, 11, 40, 41, 42, 53, 54].map((leaf) => pages.get(leaf))).toEqual(
      [1, 2, 31, 32, 33, 34, 35],
    );
  });

  it("numbers a page without a head before a folded table on from the page before", () => {
    // Page 40 lost its head; the table's title on 41, its blank back 42, a
    // fold's edge, five parts scanned across, then 43 opening a chapter.
    const pages = printedPageNumbers([
      ...[36, 37, 38, 39].map((page) => text(page + 3, page)),
      { leaf: 43, head: null, words: 66 },
      { leaf: 44, head: null, words: 4 },
      { leaf: 45, head: null, words: 1 },
      { leaf: 46, head: null, words: 1 },
      ...[47, 48, 49, 50, 51].map(across),
      opening(52),
      ...[44, 45, 46].map((page) => text(page + 9, page)),
    ]);

    expect(
      Array.from({ length: 53 - 43 }, (_, index) => pages.get(43 + index)),
    ).toEqual([40, 41, 42, null, null, null, null, null, null, 43]);
  });

  it("counts no plate for a leaf left out as a rescan", () => {
    // A work's half-title (57) and its blank back (58), its first page (59)
    // scanned twice, the rescan (leaf 74) left out, and a blank leaf
    // between them.
    const pages = printedPageNumbers([
      ...[53, 54, 55].map((page) => text(page + 13, page)),
      { leaf: 69, head: null, words: 1 },
      plate(70),
      { leaf: 71, head: null, words: 0 },
      opening(72),
      { leaf: 73, head: null, words: 0 },
      ...[60, 61, 62].map((page) => text(page + 15, page)),
    ]);

    expect([69, 70, 71, 72, 73, 75].map((leaf) => pages.get(leaf))).toEqual([
      56,
      57,
      58,
      59,
      null,
      60,
    ]);
  });

  it("still ignores a run of heads the OCR misread lower, with pages between", () => {
    // 330 to 341 read as 310 to 321 at the volume's end, a run of pages
    // between: no plates there to lower the numbering by twenty.
    const pages = printedPageNumbers([
      ...Array.from({ length: 40 }, (_, index) =>
        text(10 + index, 290 + index),
      ),
      ...Array.from({ length: 12 }, (_, index) =>
        text(50 + index, 310 + index),
      ),
    ]);

    expect([49, 50, 61].map((leaf) => pages.get(leaf))).toEqual([
      329, 330, 341,
    ]);
  });

  it("keeps the number a scan states for a page, however far it jumps: a paper's next issue", () => {
    const stated = (leaf: number, head: number): LeafReading => ({
      leaf,
      head,
      stated: true,
      words: 300,
    });
    const pages = printedPageNumbers([
      stated(0, 244),
      stated(1, 245),
      stated(2, 246),
      stated(3, 276),
      stated(4, 277),
      stated(5, 278),
      stated(6, 279),
    ]);

    expect([0, 1, 2, 3, 4, 5, 6].map((leaf) => pages.get(leaf))).toEqual([
      244, 245, 246, 276, 277, 278, 279,
    ]);
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

  it("runs a title broken off at a hyphen on to the centred line below it", async () => {
    const hocr = (
      await readFile(
        join(import.meta.dir, "fixtures", "archive-ocr-numbered-titles.html"),
        "utf8",
      )
    )
      .replace(
        "<span class='ocr_line' title='bbox 620 250 1280 290; x_size 52'>II. Die Bürstenheimer.</span>",
        "<span class='ocr_line' title='bbox 560 250 1340 290; x_size 52'>II. Die Bürsten-</span>\n  <span class='ocr_line' title='bbox 830 300 1070 340; x_size 52'>heimer.</span>",
      )
      .replace("der 25. Juni drang", "der 25. Juni drang den Bürstenheimer");
    const units = parseArchiveOcrWork(hocr, {
      item: "10067670bsb",
      title: "Herr Vogt",
      citation: "Herr Vogt",
      firstPage: 20,
      lastPage: 23,
    });

    expect(units.map((unit) => unit.title)).toEqual([
      "I. Die Schwefelbande.",
      "II. Die Bürstenheimer.",
    ]);
    expect(units[1]?.paragraphs[0]).toStartWith("Der 25. Februar");
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
      [
        "Die Räumung der Donaufürstentümer.",
        "Die Handelskrise im Parlament.",
        "I",
      ],
      [
        "Die Räumung der Donaufürstentümer.",
        "Die Handelskrise im Parlament.",
        "II",
      ],
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
      "Die Handelskrise im Parlament.",
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

    // The group is titled as its heading prints it; its running heads repeat it.
    expect(units.map((unit) => [...unit.parents, unit.title])).toEqual([
      ["Das Ministerium Camphausen.", "Köln, 3. Juni."],
      ["Das Ministerium Camphausen.", "Köln, 13. Juni."],
      ["Die Polendebatte in Frankfurt.", "Köln, 7. August."],
      ["Die Polendebatte in Frankfurt.", "Köln, im Januar."],
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

describe("parseArchiveOcrWork, sections numbered with a bracket", () => {
  it("reads sections numbered 1) and lettered A. as titled, a) below them, not the notes numbered so", async () => {
    const units = parseArchiveOcrWork(
      await readFile(
        join(
          import.meta.dir,
          "fixtures",
          "archive-ocr-bracketed-sections.html",
        ),
        "utf8",
      ),
      {
        item: "zur-kritik-der-politischen-okonomie",
        title: "Zur Kritik der politischen Oekonomie",
        citation: "Kritik",
        firstPage: 41,
        lastPage: 44,
      },
    );

    expect(units.map((unit) => [...unit.parents, unit.title])).toEqual([
      [
        "I. Das Geld oder die einfache Cirkulation.",
        "I. Das Geld oder die einfache Cirkulation.",
      ],
      ["I. Das Geld oder die einfache Cirkulation.", "1) Maaß der Werthe."],
      [
        "I. Das Geld oder die einfache Cirkulation.",
        "B. Theorieen von der Maaßeinheit des Geldes.",
      ],
      [
        "I. Das Geld oder die einfache Cirkulation.",
        "2) Cirkulationsmittel.",
        "a) Die Metamorphose der Waaren.",
      ],
      ["I. Das Geld oder die einfache Cirkulation.", "3) Geld."],
    ]);
  });

  it("reads a numbered note set close below the text, a little smaller than it, as a note", async () => {
    const units = parseArchiveOcrWork(
      await readFile(
        join(
          import.meta.dir,
          "fixtures",
          "archive-ocr-bracketed-sections.html",
        ),
        "utf8",
      ),
      {
        item: "zur-kritik-der-politischen-okonomie",
        title: "Zur Kritik der politischen Oekonomie",
        citation: "Kritik",
        firstPage: 41,
        lastPage: 47,
      },
    );
    const paragraphs = units.at(-1)?.paragraphs ?? [];

    // The text runs on across the note into the next page.
    expect(paragraphs.join("\n")).toContain(
      "durch die Arbeitszeit zu messende Tauschwerthe, sondern",
    );
    expect(paragraphs).toContain(
      "1) Die Sonderbarkeit, daß die Unze Gold in England als Maaßeinheit des Geldes in nicht aliquote Theile abgetheilt ist, erklärt sich wie folgt.",
    );
    // A list's item measured as small, spaced as the text is, stays text.
    expect(paragraphs.join("\n")).toContain(
      "wo es ihnen nicht zugänglich hätte sein sollen,",
    );
  });

  it("reads the lines below a rule read as dashes and a letter or two as notes", async () => {
    const units = parseArchiveOcrWork(
      await readFile(
        join(
          import.meta.dir,
          "fixtures",
          "archive-ocr-bracketed-sections.html",
        ),
        "utf8",
      ),
      {
        item: "zur-kritik-der-politischen-okonomie",
        title: "Zur Kritik der politischen Oekonomie",
        citation: "Kritik",
        firstPage: 41,
        lastPage: 49,
      },
    );
    const paragraphs = units.at(-1)?.paragraphs ?? [];

    // The text runs on across the notes into the next page.
    expect(paragraphs.join("\n")).toContain(
      "das als Material des Geldes diente, war gesellschaftlich gegeben.",
    );
    expect(paragraphs.join("\n")).not.toContain("πε");
    // Unmarked, the lines are a note run on from a page the fixture leaves
    // out, not the note pages before them.
    expect(paragraphs.at(-1)).toBe(
      "measure of value as if it remained perfectly stationary. Suppose, for instance, it is reduced in value, the relations stay the same.",
    );
  });

  it("reads notes filling most of a page against the text above them, not the page's lines", async () => {
    const units = parseArchiveOcrWork(
      await readFile(
        join(
          import.meta.dir,
          "fixtures",
          "archive-ocr-bracketed-sections.html",
        ),
        "utf8",
      ),
      {
        item: "zur-kritik-der-politischen-okonomie",
        title: "Zur Kritik der politischen Oekonomie",
        citation: "Kritik",
        firstPage: 41,
        lastPage: 51,
      },
    );
    const paragraphs = units.at(-1)?.paragraphs ?? [];

    expect(paragraphs.join("\n")).toContain(
      "die Geldnamen der Metallgewichte von ihren allgemeinen Gewichtsnamen",
    );
    expect(paragraphs.at(-1)).toStartWith("2) Der romantische A. Müller sagt");
    expect(paragraphs.at(-1)).toEndWith("Liberalität unentgeldlich münzt.“");
  });

  it("keeps the note run on below a rule read as dashes", async () => {
    const units = parseArchiveOcrWork(
      await readFile(
        join(
          import.meta.dir,
          "fixtures",
          "archive-ocr-bracketed-sections.html",
        ),
        "utf8",
      ),
      {
        item: "zur-kritik-der-politischen-okonomie",
        title: "Zur Kritik der politischen Oekonomie",
        citation: "Kritik",
        firstPage: 41,
        lastPage: 49,
      },
    );
    const paragraphs = units.at(-1)?.paragraphs ?? [];
    // Unmarked, the lines are a note run on from a page the fixture leaves
    // out, not the note pages before them.
    expect(paragraphs.at(-1)).toBe(
      "measure of value as if it remained perfectly stationary. Suppose, for instance, it is reduced in value, the relations stay the same.",
    );
  });
});

describe("parseArchiveOcrWork, bracketed titles set as Kautsky sets them", () => {
  it("reads a title run on to a centred line, one set across the measure, and Greek letters below them", async () => {
    const units = parseArchiveOcrWork(
      await readFile(
        join(import.meta.dir, "fixtures", "archive-ocr-wrapped-sections.html"),
        "utf8",
      ),
      {
        item: "p1theorienberden02marxuoft",
        title: "Theorien über den Mehrwert",
        citation: "Theorien II.1",
        firstPage: 9,
        lastPage: 12,
        // Kautsky sets his notes as large as the text.
        spacedNotes: true,
      },
    );

    const section = [
      "I. Mehrwert und Profit.",
      "2. Ricardos Theorie des Profits.",
    ];
    expect(units.map((unit) => [...unit.parents, unit.title])).toEqual([
      [...section, "a) Ricardos Darstellung vom Wert."],
      [
        ...section,
        "b) Ricardos Darstellung von Profit, Profitrate, Produktionspreisen usw.",
      ],
      [
        ...section,
        "c) Wert und Produktionspreis in der Agrikultur.",
        "c) Wert und Produktionspreis in der Agrikultur.",
      ],
      [
        ...section,
        "c) Wert und Produktionspreis in der Agrikultur.",
        "α) Ricardos Anschauungen.",
      ],
      [...section, "d) Der Mehrwert."],
      [
        ...section,
        "e) Th. Chalmers und einige Anschauungen über die Rente von A. Smith.",
      ],
      [
        ...section,
        "f) Ferrier. Smith über die Akkumulation von Kapital. Eine neue Definition der produktiven Arbeit.",
      ],
      [...section, "h) Wert der Arbeitskraft und Wert der Arbeit."],
      [
        ...section,
        "i) Einige psychische Besonderheiten der Zwangskranken — ihr Verhältnis zur Realität, zum Aberglauben und zum Tod",
      ],
    ]);
    expect(units.at(-5)?.paragraphs[0]).toContain(
      "Ricardo ist hier keineswegs theoretisch klar.",
    );
  });

  it("reads a small e above a vowel as the umlaut the volume spells, or as a speck", async () => {
    const units = parseArchiveOcrWork(
      await readFile(
        join(import.meta.dir, "fixtures", "archive-ocr-wrapped-sections.html"),
        "utf8",
      ),
      {
        item: "p1theorienberden02marxuoft",
        title: "Theorien über den Mehrwert",
        citation: "Theorien II.1",
        firstPage: 9,
        lastPage: 12,
        spacedNotes: true,
      },
    );

    expect(units.at(-1)?.paragraphs.at(-1)).toBe(
      "Der Tauschwerth wäre ein anderer, wäre der Tauschwerth nicht der Gebrauchswerth, kein Gebrauchswerth. Der sächsische Staat, der sächsische Hof; wäre er, wäre er.",
    );
  });
});

describe("parseArchiveOcrWork, headings set in the text's type", () => {
  const read = async (
    headings?: Array<{ page: number; opens: string; numeral?: string }>,
  ): Promise<ReturnType<typeof parseArchiveOcrWork>> =>
    parseArchiveOcrWork(
      await readFile(
        join(
          import.meta.dir,
          "fixtures",
          "archive-ocr-unnumbered-chapter.html",
        ),
        "utf8",
      ),
      {
        item: "10394216bsb",
        title: "Enthüllungen über den Kommunisten-Prozeß zu Köln",
        citation: "Enthüllungen",
        firstPage: 3,
        lastPage: 4,
        ...(headings ? { headings } : {}),
      },
    );

  it("opens the headings the manifest names by their first lines: a chapter numbered by place, a numbered piece by its number", async () => {
    const units = await read([
      { page: 4, opens: "Das Begleit-Schreiben" },
      { page: 4, opens: "1) Beilage 4" },
    ]);

    expect(units.map((unit) => [unit.title, unit.section])).toEqual([
      ["I. Vorläufiges.", "Enthüllungen, 3"],
      ["II. Das Begleit-Schreiben des rothen Katechismus.", "Enthüllungen, 4"],
      ["III. Die Fraktion Willich-Schapper.", "Enthüllungen, 4"],
      [
        "1) Beilage 4 zu „Herr Vogt“ von Karl Marx, London 1860.",
        "Enthüllungen, 4",
      ],
      ["Beilagen.", "Enthüllungen, 4"],
    ]);
    expect(units[1]?.paragraphs[0]).toStartWith("Die pr. Regierung");
  });

  it("opens a section above the line the manifest names with the numeral the scan lost", async () => {
    const units = await read([
      { page: 3, opens: "Paris war das einzige", numeral: "II" },
      { page: 4, opens: "1) Beilage 4", numeral: "IV" },
    ]);

    expect(
      units.map((unit) => [...unit.parents, unit.title].join(" > ")),
    ).toEqual([
      "I. Vorläufiges.",
      "II",
      "III. Die Fraktion Willich-Schapper.",
      "IV",
      // The appendices close the work beside its chapters.
      "Beilagen.",
    ]);
    expect(units[1]?.paragraphs[0]).toStartWith("Paris war das einzige");
  });

  it("titles a heading without the mark of the note it carries", async () => {
    const units = parseArchiveOcrWork(
      (
        await readFile(
          join(
            import.meta.dir,
            "fixtures",
            "archive-ocr-unnumbered-chapter.html",
          ),
          "utf8",
        )
      )
        .replace(">chismus.</span>", ">chismus *).</span>")
        .replace("Vorläufiges.", "Vorläufiges¹)."),
      {
        item: "10394216bsb",
        title: "Enthüllungen über den Kommunisten-Prozeß zu Köln",
        citation: "Enthüllungen",
        firstPage: 3,
        lastPage: 4,
        headings: [{ page: 4, opens: "Das Begleit-Schreiben" }],
      },
    );

    expect(units.map((unit) => unit.title).slice(0, 2)).toEqual([
      "I. Vorläufiges.",
      "II. Das Begleit-Schreiben des rothen Katechismus.",
    ]);
  });

  it("reads the line as text where the manifest names none", async () => {
    const units = await read();

    expect(units.map((unit) => unit.title)).toEqual([
      "I. Vorläufiges.",
      "II. Die Fraktion Willich-Schapper.",
      "Beilagen.",
    ]);
  });
});

describe("parseArchiveOcrWork, headings the manifest names by level and label", () => {
  /** A line of the page, set at the margin in the text's type, or in from it. */
  const line = (text: string, y: number, x = 245): string =>
    `<span class='ocr_line' title='bbox ${x} ${y} 2150 ${y + 80}; x_size 78'>${text}</span>`;
  const paragraph = (y: number): string =>
    [
      line("Die Kinder leiden an einer Lähmung der einen Seite, die", y, 330),
      line("schon früh beginnt und lange anhält, wie man es sieht.", y + 100),
    ].join("\n");
  const page = (leaf: number, lines: string[]): string =>
    `<div class='ocr_page' id='page_${String(leaf).padStart(6, "0")}' title='bbox 0 0 2400 3800'>
 <p class='ocr_par'>${lines.join("\n")}</p>
</div>`;
  const hocr = `<html><body>${[
    page(10, [
      line("Einleitung. Nosographische Stellung.", 500),
      paragraph(600),
      line("IIa. Geschichte der Lähmung.", 900),
      paragraph(1000),
    ]),
    page(11, [
      line("2 Typische Fälle der Lähmung.", 200, 900),
      line("A. Typische Fälle der Lähmung.", 500),
      paragraph(600),
      line("B. Leichte Fälle der Lähmung.", 900),
      paragraph(1000),
    ]),
    page(12, [
      line("XI—XVI. 3", 200, 1800),
      line("B. Leichte Fälle der Lähmung.", 300),
      paragraph(500),
      line("IIIb. Klinik der Lähmung.", 900),
      paragraph(1000),
      line("Pathologie der Lähmung.", 1300),
      paragraph(1400),
    ]),
    // Its running head carries the words of the heading below it.
    page(13, [
      line("KLINIK DER STARRE 4", 200, 900),
      line("KLINIK DER STARRE", 500),
      paragraph(600),
    ]),
  ].join("")}</body></html>`;

  it("opens chapters labelled as printed or unnumbered, and lettered sections, numbering on from the labels", () => {
    const units = parseArchiveOcrWork(hocr, {
      item: "infantile",
      title: "Die infantile Cerebrallähmung",
      citation: "Infantile",
      firstPage: 1,
      lastPage: 4,
      headings: [
        { page: 1, opens: "Einleitung. Nosographische", level: 1 },
        { page: 1, opens: "IIa. Geschichte", level: 1, label: "IIa" },
        { page: 2, opens: "A. Typische Fälle", level: 2, label: "A" },
        { page: 2, opens: "B. Leichte Fälle", level: 2, label: "B" },
        // A heading set high on its page is no running head.
        { page: 3, opens: "B. Leichte Fälle", level: 2, label: "B" },
        { page: 3, opens: "IIIb. Klinik", level: 1, label: "IIIb" },
        { page: 3, opens: "Pathologie der Lähmung" },
        { page: 4, opens: "KLINIK DER STARRE" },
      ],
    });

    expect(
      units.map((unit) => [...unit.parents, unit.title].join(" > ")),
    ).toEqual([
      "Einleitung. Nosographische Stellung.",
      "IIa. Geschichte der Lähmung. > IIa. Geschichte der Lähmung.",
      "IIa. Geschichte der Lähmung. > A. Typische Fälle der Lähmung.",
      "IIa. Geschichte der Lähmung. > B. Leichte Fälle der Lähmung.",
      "IIa. Geschichte der Lähmung. > B. Leichte Fälle der Lähmung.",
      "IIIb. Klinik der Lähmung.",
      "IV. Pathologie der Lähmung.",
      "V. Klinik der Starre",
    ]);
    expect(units[4]?.paragraphs[0]).toStartWith("Die Kinder leiden");
  });
});

describe("parseArchiveOcrWork, leaves scanned at two sizes", () => {
  it("reads every page at one scale, its running head below a wide margin", async () => {
    const units = parseArchiveOcrWork(
      await readFile(
        join(import.meta.dir, "fixtures", "archive-ocr-two-scales.html"),
        "utf8",
      ),
      {
        item: "enthullungen-1885",
        title: "Enthüllungen über den Kommunistenprozeß zu Köln",
        citation: "Enthüllungen",
        firstPage: 18,
        lastPage: 20,
        headings: [{ page: 20, opens: "1) Beilage 4" }],
      },
    );

    expect(units.map((unit) => [unit.title, unit.section])).toEqual([
      ["I. Vorläufiges.", "Enthüllungen, 18"],
      ["II. Das Archiv Dietz.", "Enthüllungen, 20"],
      [
        "1) Beilage 4 zu „Herr Vogt“ von Karl Marx, London 1860.",
        "Enthüllungen, 20",
      ],
    ]);
    // A piece numbered with a bracket stands below the section numbered in
    // roman above it.
    expect(units[2]?.parents).toEqual(["II. Das Archiv Dietz."]);
    expect(units[0]?.paragraphs).toHaveLength(6);
  });
});

describe("parseArchiveOcrWork, a page set with wide leading", () => {
  it("reads no line of the text as a title for the space every line leaves", async () => {
    const units = parseArchiveOcrWork(
      await readFile(
        join(import.meta.dir, "fixtures", "archive-ocr-leaded.html"),
        "utf8",
      ),
      {
        item: "bub_gb_d0M6AAAAcAAJ",
        title: "Herr Vogt",
        citation: "Herr Vogt",
        firstPage: 4,
        lastPage: 4,
      },
    );

    expect(units.map((unit) => unit.title)).toEqual(["Herr Vogt, 4"]);
    expect(units[0]?.paragraphs.join("\n")).toContain(
      "Nr. 41 über Vogt's Pamphlet: „Mein Prozeß gegen die Allgemeine Zeitung“.",
    );
  });
});

describe("parseArchiveOcrWork, a page scanned askew", () => {
  it("opens a paragraph only where a line is set in from the lines about it", async () => {
    const units = parseArchiveOcrWork(
      await readFile(
        join(import.meta.dir, "fixtures", "archive-ocr-skewed.html"),
        "utf8",
      ),
      {
        item: "freud-1940-gw-13",
        title: "Eine Teufelsneurose im siebzehnten Jahrhundert",
        citation: "GW XIII",
        firstPage: 333,
        lastPage: 333,
      },
    );
    const paragraphs = units.flatMap((unit) => unit.paragraphs);

    expect(paragraphs).toHaveLength(3);
    expect(paragraphs[0]).toEndWith("gegen den Vater gerichtet.");
    expect(paragraphs[1]).toStartWith(
      "Dieselbe Ambivalenz beherrscht nach unserer Auffassung das",
    );
    // A line set in that opens in lower case runs on the line above.
    expect(paragraphs[2]).toBe(
      "3. „Die Befreiung der Arbeit erfordert die Erhebung der zu Gemeingut der Gesellschaft und die Regelung der Gesammtarbeit mit gerechter Vertheilung des Arbeitsertrags.“",
    );
  });

  it("reads a column beside a picture by its own margin, not the text's across the page below", async () => {
    const units = parseArchiveOcrWork(
      await readFile(
        join(import.meta.dir, "fixtures", "archive-ocr-skewed.html"),
        "utf8",
      ),
      {
        item: "freud-1940-gw-13",
        title: "Eine Kindheitserinnerung des Leonardo da Vinci",
        citation: "GW XIII",
        firstPage: 335,
        lastPage: 335,
      },
    );
    const paragraphs = units.flatMap((unit) => unit.paragraphs);

    expect(paragraphs).toHaveLength(3);
    expect(paragraphs[1]).toStartWith("Die weibliche Brust zeigt zwei Mängel");
    expect(paragraphs[1]).toContain(
      "wahrscheinlich nach Leonardos Meinung die Milch",
    );
    // Below a paragraph's short last line, a line set in at all opens the next.
    expect(paragraphs[2]).toStartWith(
      "Wenn man von wenig bekannten inneren Antrieben",
    );
  });
});

describe("parseArchiveOcrWork, a title in display type across the column", () => {
  it("reads it apart from the text by the space its tall lines leave, less than a line's height", async () => {
    const units = parseArchiveOcrWork(
      await readFile(
        join(import.meta.dir, "fixtures", "archive-ocr-display-title.html"),
        "utf8",
      ),
      {
        item: "lohnarbeitundka00marxgoog",
        title: "Lohnarbeit und Kapital",
        citation: "Lohnarbeit",
        firstPage: 19,
        lastPage: 22,
      },
    );

    expect(units.map((unit) => unit.title)).toEqual([
      "Lohnarbeit, 19",
      "Wodurch wird der Preis einer Ware bestimmt?",
    ]);
    // A note set nearly as large as the text stands apart from the
    // paragraph running on across the page.
    expect(units.at(-1)?.paragraphs.join("\n")).toContain(
      "bestimmt wird, ist dreiseitig.",
    );
  });

  it("reads notes set in from the margin and short of the line as notes, not a heading", async () => {
    const units = parseArchiveOcrWork(
      await readFile(
        join(import.meta.dir, "fixtures", "archive-ocr-display-title.html"),
        "utf8",
      ),
      {
        item: "lohnarbeitundka00marxgoog",
        title: "Lohnarbeit und Kapital",
        citation: "Lohnarbeit",
        firstPage: 19,
        lastPage: 22,
      },
    );
    const paragraphs = units.at(-1)?.paragraphs ?? [];

    // The text runs on across the notes into the next page.
    expect(paragraphs.join("\n")).toContain(
      "Der Kapitalist kauft mit einem Teil seines vorhandenen Vermögens",
    );
    expect(paragraphs).toContain(
      "1) Marx schrieb: womit er 12 Stunden Arbeit kaufte. K.",
    );
    // A note whose digit the OCR lost still opens with its bracket.
    expect(paragraphs).toContain(") Marx schrieb: Für soviel Arbeit. K.");
  });

  it("reads a note set nearly as large as the text below a rule's space, and runs a broken word on past a note measured large", async () => {
    const units = parseArchiveOcrWork(
      await readFile(
        join(import.meta.dir, "fixtures", "archive-ocr-display-title.html"),
        "utf8",
      ),
      {
        item: "lohnarbeitundka00marxgoog",
        title: "Lohnarbeit und Kapital",
        citation: "Lohnarbeit",
        firstPage: 19,
        lastPage: 25,
      },
    );
    const paragraphs = units.flatMap((unit) => unit.paragraphs);
    const text = paragraphs.join("\n");

    expect(text).toContain(
      "Der Verkaufspreis der Ware teilt sich für den Kapitalisten in drei Teile",
    );
    expect(paragraphs).toContain(
      "1) Marx schrieb: der relative Arbeitslohn dagegen den Preis der unmittelbaren Arbeit im Verhältnis zum Preise der aufgehäuften Arbeit, den Wert der Kapitalisten und Arbeiter. K.",
    );
    // The next page ends the word the text broke; the note between ends a
    // sentence.
    expect(text).toContain("wirklich so unzertrennlich verbunden");
    expect(paragraphs).toContain("1) Marx schrieb: der Tauschwert. K.");
  });
});

describe("parseArchiveOcrWork, a scan whose lines curve", () => {
  it("opens a paragraph only below a sentence's end, where the line above stops short or the line is set in", async () => {
    const units = parseArchiveOcrWork(
      await readFile(
        join(import.meta.dir, "fixtures", "archive-ocr-curved.html"),
        "utf8",
      ),
      {
        item: "ldpd_13048930_000",
        title: "Der Bürgerkrieg in Frankreich",
        citation: "Bürgerkrieg",
        firstPage: 1,
        lastPage: 2,
        opensWith: "Am 4. September",
        curved: true,
      },
    );

    // A paragraph whose last line runs full, its next line set in no further
    // than the curve moves lines, stays joined: In einem Brief, below a quotation.
    expect(
      units.flatMap((unit) =>
        unit.paragraphs.map((paragraph) => paragraph.slice(0, 20)),
      ),
    ).toEqual([
      "Am 4. September 187⁰",
      "V. Das erste, was si",
      "D Die erste Frage, d",
      "Also: Am selben Aben",
    ]);
  });
});

describe("parseArchiveOcrWork, a poem", () => {
  it("keeps each line of verse, and opens a stanza below the space it leaves", () => {
    const line = (x: number, y: number, text: string): string =>
      `<span class='ocr_line' title='bbox ${x} ${y} ${x + 1000} ${y + 80}; x_size 80'>${text}</span>`;
    const hocr = `<html><body><div class='ocr_page' id='page_0' title='bbox 0 0 3000 4500'><span class='ocr_pageno'>604</span>
 <p class='ocr_par'>${[
   line(880, 1260, "Spielmann streicht die Geigen,"),
   line(880, 1348, "Die lichtbraunen Haare sich neigen,"),
   line(1030, 1434, "Trägt einen Säbel an der Seit’,"),
   line(880, 1610, "„Spielmann, Spielmann, was streichst du so sehr,"),
   line(1030, 1698, "Zerreißt dir ja deinen Bogen.“"),
 ].join("\n")}</p>
</div></body></html>`;

    const units = parseArchiveOcrWork(hocr, {
      item: "mew-40",
      title: "Wilde Lieder",
      citation: "MEW 40",
      firstPage: 604,
      lastPage: 604,
      verse: true,
    });

    expect(units.flatMap((unit) => unit.paragraphs)).toEqual([
      "Spielmann streicht die Geigen,  \nDie lichtbraunen Haare sich neigen,  \nTrägt einen Säbel an der Seit’,",
      "„Spielmann, Spielmann, was streichst du so sehr,  \nZerreißt dir ja deinen Bogen.“",
    ]);
  });
});

describe("parseArchiveOcrWork, a dictionary's articles", () => {
  it("titles an article by the headword the manifest names, the line staying its text, though it names the line's paragraph too", () => {
    const line = (x: number, y: number, text: string): string =>
      `<span class='ocr_line' title='bbox ${x} ${y} ${x + 1300} ${y + 60}; x_size 60'>${text}</span>`;
    const hocr = `<html><body><div class='ocr_page' id='page_0' title='bbox 0 0 1500 3000'><span class='ocr_pageno'>105</span>
 <p class='ocr_par'>${[
   line(100, 200, "the Austrians, and was pillaged by the French."),
   line(140, 270, "ARMADA, Spanish, the great naval arma-"),
   line(100, 340, "ment sent by King Philip II. of Spain, in 1588."),
   line(140, 410, "The fleet consisted of 130 vessels."),
   line(140, 480, "AYACUCHO, a department of Peru, where"),
   line(100, 550, "the Spaniards were defeated in 1824."),
 ].join("\n")}</p>
</div></body></html>`;

    const units = parseArchiveOcrWork(hocr, {
      item: "cyclopaedia",
      title: "Articles",
      citation: "Cyclopaedia",
      firstPage: 105,
      lastPage: 105,
      opensWith: "ARMADA",
      headings: [
        { page: 105, opens: "ARMADA, Spanish", title: "Armada" },
        { page: 105, opens: "AYACUCHO", title: "Ayacucho" },
      ],
      // Its articles set no paragraphs in: only a headword opens one.
      paragraphs: [
        { page: 105, opens: "ARMADA" },
        { page: 105, opens: "AYACUCHO" },
      ],
    });

    expect(
      units.map((unit) => [unit.title, unit.paragraphs.join(" / ")]),
    ).toEqual([
      [
        "Armada",
        "ARMADA, Spanish, the great naval armament sent by King Philip II. of Spain, in 1588. The fleet consisted of 130 vessels.",
      ],
      [
        "Ayacucho",
        "AYACUCHO, a department of Peru, where the Spaniards were defeated in 1824.",
      ],
    ]);
  });
});

describe("parseArchiveOcrWork, signs the Fraktur model misreads", () => {
  it("reads a plus, an equals sign and a pound after a figure as the print sets them", async () => {
    const units = parseArchiveOcrWork(
      await readFile(
        join(import.meta.dir, "fixtures", "archive-ocr-wrapped-sections.html"),
        "utf8",
      ),
      {
        item: "p1theorienberden02marxuoft",
        title: "Theorien über den Mehrwert",
        citation: "Theorien II.1",
        firstPage: 9,
        lastPage: 12,
        spacedNotes: true,
      },
    );

    expect(units.at(-1)?.paragraphs.at(-2)).toBe(
      "Das Kapital 80 c + 20 v gibt 110 = 100 + 10 £, Hope & Co., Ab6& 4; 130 £ (10), 300 £; von 1820 „Principles“ 1696“ seit.",
    );
  });
});

describe("parseArchiveOcrWork, a table read anew from the scan", () => {
  it("reads its rows as text, not a title however large the OCR read them, and the text below them as text, not notes", async () => {
    const units = parseArchiveOcrWork(
      await readFile(
        join(import.meta.dir, "fixtures", "archive-ocr-wrapped-sections.html"),
        "utf8",
      ),
      {
        item: "p1theorienberden02marxuoft",
        title: "Theorien über den Mehrwert",
        citation: "Theorien II.1",
        firstPage: 13,
        lastPage: 13,
        spacedNotes: true,
        corrections: [
          {
            page: 13,
            from: "Klasse Kapital Tonnen Rente 5 100 60 2 70 0",
            to: "Klasse | Kapital | Tonnen\nI | 100 | 60\nII | 100 | 65",
          },
        ],
        paragraphs: [
          { page: 13, opens: "Ricardo geht" },
          { page: 13, opens: "Klasse |" },
          { page: 13, opens: "I |" },
          { page: 13, opens: "II |" },
        ],
      },
    );

    expect(units.map((unit) => unit.title)).toEqual(["Theorien II.1, 13"]);
    expect(units[0]?.paragraphs.slice(4)).toEqual([
      // Its rows one markdown table, the row without figures its head.
      "| Klasse | Kapital | Tonnen |\n| --- | --- | --- |\n| I | 100 | 60 |\n| II | 100 | 65 |",
      "Würde diese Tabelle nun umgekehrt dargestellt nach Ricardos absteigender Linie, also von III begonnen und zugleich angenommen, daß der zuerst bebaute fruchtbarere Boden keine Rente zahlt.",
    ]);
  });
});

describe("parseArchiveOcrWork, a page of a table alone", () => {
  it("reads the page, its rows read anew from the scan, as no picture, and a line the manifest names as opening a paragraph as no heading", async () => {
    const units = parseArchiveOcrWork(
      await readFile(
        join(import.meta.dir, "fixtures", "archive-ocr-wrapped-sections.html"),
        "utf8",
      ),
      {
        item: "p1theorienberden02marxuoft",
        title: "Theorien über den Mehrwert",
        citation: "Theorien II.1",
        firstPage: 14,
        lastPage: 14,
        spacedNotes: true,
        corrections: [
          {
            page: 14,
            from: "III 100 81½j 13023 130½23 175⁵ 15/½5 0",
            to: "III | 100 | 81",
          },
          {
            page: 14,
            from: "B. Zweite Klasse II tritt ein. Entstehung der Rente.",
            to: "B. Zweite Klasse II tritt ein. Entstehung der Rente auf Boden III.",
          },
          {
            page: 14,
            from: "II 100 67½/63 1237½¹ 123, 1½s 14½3 0",
            to: "II | 100 | 67",
          },
          {
            page: 14,
            from: "Totals 200 1II%% 2 266¹ù-",
            to: "Total | 200 | 148",
          },
        ],
        paragraphs: [
          { page: 14, opens: "Gang der Rente" },
          { page: 14, opens: "III |" },
          { page: 14, opens: "B. Zweite" },
          { page: 14, opens: "II |" },
          { page: 14, opens: "Total |" },
        ],
      },
    );

    expect(units.flatMap((unit) => unit.paragraphs)).toEqual([
      "Gang der Rente",
      // A table without a head of its own has an empty one; a lettered caption
      // between its rows is one of them.
      "|  |  |  |\n| --- | --- | --- |\n| III | 100 | 81 |\n| B. Zweite Klasse II tritt ein. Entstehung der Rente auf Boden III. |  |  |\n| II | 100 | 67 |\n| Total | 200 | 148 |",
    ]);
  });
});

describe("parseArchiveOcrWork on a page whose note the manifest names", () => {
  it("reads the notes from the line it names, set as the text is, and opens no other note there", async () => {
    const units = parseArchiveOcrWork(await fixture(), {
      ...work,
      spacedNotes: true,
      notes: [{ page: 5, opens: "Die Ich-" }],
    });

    // No other line on that page opens a note, however set in.
    expect(units[0]?.paragraphs.slice(-2)).toEqual([
      "¹) Vgl. Zur Psychoanalyse der Kriegsneurosen. Mit Beiträgen von Ferenczi, Abraham, Simmel und E. Jones, 1919.",
      "Die Ich-Analyse beginnt hier. Ein Satz unten auf der Seite läuft weiter, und am Rand rutscht ein Wort nach unten.",
    ]);
  });
});

describe("parseArchiveOcrWork, a note read by eye", () => {
  it("keeps a note a correction read from the scan, however few its words: l. c.", () => {
    const line = (y: number, size: number, text: string): string =>
      `<span class='ocr_line' title='bbox 100 ${y} 2000 ${y + size}; x_size ${size}'>${text}</span>`;
    const hocr = `<html><body><div class='ocr_page' id='page_0' title='bbox 0 0 2100 3300'><span class='ocr_pageno'>278</span>
 <p class='ocr_par'>${line(100, 60, "Eine ähnliche Bevorzugung des Zentrums wäre vielleicht für den")}
 ${line(170, 60, "Trismus geltend zu machen, der, wegen der vermuthlichen Innervation")}
 ${line(240, 60, "der Kaumuskeln von beiden Hemisphären, keinen Hinweis geben kann.")}</p>
 <p class='ocr_par'>${line(2900, 40, "%) Vergl. zu diesem Absatze Nothnagel’s Topische Diagnostik.")}
 <span class='ocr_line' title='bbox 160 2960 400 3000; x_size 40'>I0O</span>
 ${line(3020, 40, "ı2) Vergl. Wernicke II, p. 60 u. A.")}</p>
</div></body></html>`;
    const units = parseArchiveOcrWork(hocr, {
      item: "wmw-1884-hirnblutung",
      title: "Ein Fall von Hirnblutung",
      citation: "WMW 1884",
      firstPage: 278,
      lastPage: 278,
      corrections: [
        {
          page: 278,
          from: "%) Vergl. zu diesem Absatze Nothnagel’s Topische Diagnostik.",
          to: "⁹) Vergl. zu diesem Absatze Nothnagel’s Topische Diagnostik.",
        },
        { page: 278, from: "I0O", to: "¹⁰) l. c." },
        {
          page: 278,
          from: "12) Vergl. Wernicke II, p. 60 u. A.",
          to: "¹¹) Vergl. Wernicke II, p. 60 u. A.",
        },
      ],
      notes: [
        { page: 278, opens: "⁹) Vergl." },
        { page: 278, opens: "¹⁰) l. c." },
        { page: 278, opens: "¹¹) Vergl." },
      ],
    });

    expect(units.flatMap((unit) => unit.paragraphs).slice(-3)).toEqual([
      "⁹) Vergl. zu diesem Absatze Nothnagel’s Topische Diagnostik.",
      "¹⁰) l. c.",
      "¹¹) Vergl. Wernicke II, p. 60 u. A.",
    ]);
  });
});

describe("parseArchiveOcrWork, bars the OCR read", () => {
  it("reads a bar as the letter or figure it stands for, else as a speck, and keeps a table's", async () => {
    const units = parseArchiveOcrWork(
      await readFile(
        join(import.meta.dir, "fixtures", "archive-ocr-wrapped-sections.html"),
        "utf8",
      ),
      {
        item: "p1theorienberden02marxuoft",
        title: "Theorien über den Mehrwert",
        citation: "Theorien II.1",
        firstPage: 15,
        lastPage: 15,
        spacedNotes: true,
        corrections: [
          {
            page: 15,
            from: "niemand weiß, wohin er ging.",
            to: "niemand weiß, wohin er ging.\nJahr | Ort | Dauer\nund damit ist es aus.",
          },
        ],
        paragraphs: [{ page: 15, opens: "Wie Frazer" }],
      },
    );

    expect(units[0]?.paragraphs).toEqual([
      "Wie Frazer, l. c., p. 106, schreibt, kam er 1847 aus der Herzegowina zurück und blieb dort bis 1905, wie er sagt. Seither ist er nicht wiedergekommen, so heißt es, und niemand weiß, wohin er ging.",
      "| Jahr | Ort | Dauer |\n| --- | --- | --- |",
      // No line runs on a table's row.
      "und damit ist es aus.",
    ]);
  });
});

describe("parseArchiveOcrWork, the page edge's shadow", () => {
  it("drops a glyph the OCR read at the scan's edge, and keeps a word there", async () => {
    const units = parseArchiveOcrWork(
      await readFile(
        join(import.meta.dir, "fixtures", "archive-ocr-wrapped-sections.html"),
        "utf8",
      ),
      {
        item: "p1theorienberden02marxuoft",
        title: "Theorien über den Mehrwert",
        citation: "Theorien II.1",
        firstPage: 16,
        lastPage: 16,
        spacedNotes: true,
      },
    );

    expect(units[0]?.paragraphs).toEqual([
      "Wenn dann die wirklichen Arbeiter daran Theil zu nehmen versuchten, um gegen diese Demonstrationen in ihre eignen Hände zu protestiren, verbot man ihnen den Eintritt.",
    ]);
  });
});

describe("parseArchiveOcrWork, a table of two columns", () => {
  it("writes rows of two cells, however long, as a markdown table", async () => {
    const left =
      "Entscheidung, ob Einer ein Böser sei: Les assises du crime, Assisen für das Verbrechen. Das öffentliche Ministerium signalisirt die Verbrechen des Angeklagten.";
    const units = parseArchiveOcrWork(
      await readFile(
        join(import.meta.dir, "fixtures", "archive-ocr-wrapped-sections.html"),
        "utf8",
      ),
      {
        item: "p1theorienberden02marxuoft",
        title: "Theorien über den Mehrwert",
        citation: "Theorien II.1",
        firstPage: 15,
        lastPage: 15,
        spacedNotes: true,
        corrections: [
          {
            page: 15,
            from: "niemand weiß, wohin er ging.",
            to: `niemand weiß, wohin er ging.\nBestehende Justiz. | Kritisch ergänzende Justiz.\n${left} | Entscheidung, ob Einer ein Guter sei.`,
          },
        ],
        paragraphs: [{ page: 15, opens: "Wie Frazer" }],
      },
    );

    expect(units[0]?.paragraphs.at(-1)).toBe(
      `| Bestehende Justiz. | Kritisch ergänzende Justiz. |\n| --- | --- |\n| ${left} | Entscheidung, ob Einer ein Guter sei. |`,
    );
  });
});

describe("parseArchiveOcrWork, the printer's signature", () => {
  it("drops a line that closes several pages alike, its sheet number aside", async () => {
    const units = parseArchiveOcrWork(
      await readFile(
        join(import.meta.dir, "fixtures", "archive-ocr-wrapped-sections.html"),
        "utf8",
      ),
      {
        item: "p1theorienberden02marxuoft",
        title: "Theorien über den Mehrwert",
        citation: "Theorien II.1",
        firstPage: 9,
        lastPage: 11,
        spacedNotes: true,
      },
    );
    const text = units.flatMap((unit) => unit.paragraphs);

    expect(text.some((paragraph) => paragraph.includes("Marx, Theorien"))).toBe(
      false,
    );
    expect(
      text.some((paragraph) =>
        paragraph.includes("Ricardo ist hier keineswegs"),
      ),
    ).toBe(true);
  });
});

describe("parseArchiveOcrWork, a signature the OCR misread", () => {
  it("drops it short as it is, its numeral in small letters or a speck after", async () => {
    const hocr = await readFile(
      join(import.meta.dir, "fixtures", "archive-ocr-wrapped-sections.html"),
      "utf8",
    );
    const signed = [
      "Freud, Vol. VII.",
      "Freud, Vol. vIl. er",
      "Freud, Vol. VII. 3:",
    ];
    let at = 0;
    const alike = hocr.replace(
      /(<span class='ocr_line'[^>]*>)(niemand weiß, wohin er ging\.|Totals 200[^<]*|Boden keine Rente zahlt\.)(<\/span>)/gu,
      (_, open: string, text: string, close: string) =>
        `${open}${text}${close}\n  <span class='ocr_line' title='bbox 400 5300 1400 5400; x_size 90'>${signed[at++]}</span>`,
    );
    const units = parseArchiveOcrWork(alike, {
      item: "p1theorienberden02marxuoft",
      title: "Theorien über den Mehrwert",
      citation: "Theorien II.1",
      firstPage: 13,
      lastPage: 15,
      spacedNotes: true,
    });
    const text = units.flatMap((unit) => unit.paragraphs).join(" ");

    expect(text).not.toContain("Freud, Vol");
  });
});

describe("parseArchiveOcrWork, a page's last line that is no signature", () => {
  it("keeps a line of text, though other pages close alike, unless it names the book and counts the sheet", async () => {
    const hocr = await readFile(
      join(import.meta.dir, "fixtures", "archive-ocr-wrapped-sections.html"),
      "utf8",
    );
    // Pages 13, 14 and 15 close with the same words, as text may.
    const alike = hocr.replace(
      /(<span class='ocr_line'[^>]*>)(niemand weiß, wohin er ging\.|Totals 200[^<]*|Boden keine Rente zahlt\.)(<\/span>)/gu,
      "$1$2$3\n  <span class='ocr_line' title='bbox 400 4900 3050 5030; x_size 104'>Psychoanalyse, die einerseits physiologische Denkweise</span>",
    );
    const units = parseArchiveOcrWork(alike, {
      item: "p1theorienberden02marxuoft",
      title: "Theorien über den Mehrwert",
      citation: "Theorien II.1",
      firstPage: 13,
      lastPage: 15,
      spacedNotes: true,
    });
    const text = units.flatMap((unit) => unit.paragraphs).join(" ");

    expect(text.split("physiologische Denkweise").length - 1).toBe(3);
  });
});

describe("parseArchiveOcrWork, a compound's first part set apart", () => {
  it("keeps its hyphen where the next line opens with und, oder or bis", async () => {
    const units = parseArchiveOcrWork(
      await readFile(
        join(import.meta.dir, "fixtures", "archive-ocr-wrapped-sections.html"),
        "utf8",
      ),
      {
        item: "p1theorienberden02marxuoft",
        title: "Theorien über den Mehrwert",
        citation: "Theorien II.1",
        firstPage: 15,
        lastPage: 15,
        spacedNotes: true,
        corrections: [
          {
            page: 15,
            from: "niemand weiß, wohin er ging.",
            to: "niemand weiß, wohin er ging, ob ins Kredit-\nund Bankwesen, drei-\nbis vierfach ver-\nschuldet.",
          },
        ],
        paragraphs: [{ page: 15, opens: "Wie Frazer" }],
      },
    );

    expect(units[0]?.paragraphs.at(-1)).toEndWith(
      "wohin er ging, ob ins Kredit- und Bankwesen, drei- bis vierfach verschuldet.",
    );
  });
});

describe("parseArchiveOcrWork, glosses in the margin", () => {
  const work = {
    item: "p1theorienberden02marxuoft",
    title: "Theorien über den Mehrwert",
    citation: "Theorien II.1",
    firstPage: 17,
    lastPage: 17,
    spacedNotes: true,
  };
  const paragraph =
    "Die Neigung, dem Sexualobjekt Schmerz zuzufügen und ihr Gegenstück, diese häufigste und bedeutsamste aller Perversionen, ist von v. Krafft-Ebing benannt worden.";

  it("leaves a gloss out of the text where the edition sets them", async () => {
    const hocr = await readFile(
      join(import.meta.dir, "fixtures", "archive-ocr-wrapped-sections.html"),
      "utf8",
    );
    const units = parseArchiveOcrWork(hocr, { ...work, marginalia: true });

    expect(units.flatMap((unit) => unit.paragraphs)).toEqual([paragraph]);
  });
});

describe("parseArchiveOcrWork, formulas restored from the scan", () => {
  it("keeps a page of equations a correction restored, though few of their tokens are words", async () => {
    const units = parseArchiveOcrWork(
      await readFile(
        join(import.meta.dir, "fixtures", "archive-ocr-wrapped-sections.html"),
        "utf8",
      ),
      {
        item: "p1theorienberden02marxuoft",
        title: "Theorien über den Mehrwert",
        citation: "Theorien II.1",
        firstPage: 15,
        lastPage: 15,
        spacedNotes: true,
        corrections: [
          {
            page: 15,
            from: "niemand weiß, wohin er ging.",
            to: "niemand weiß, wohin er ging.\n1. A. R. = I. W. — P. P. = y.\n2. D. R. = M. W. — I. W. = x.\n3. G. R. = A. R. + D. R. = y + x.\n4. M. W. — P. P. = y + x.\n5. M. W. = y + x + P. P.",
          },
        ],
        paragraphs: [
          { page: 15, opens: "Wie Frazer" },
          { page: 15, opens: "1. A. R." },
          { page: 15, opens: "2. D. R." },
          { page: 15, opens: "3. G. R." },
          { page: 15, opens: "4. M. W." },
          { page: 15, opens: "5. M. W." },
        ],
      },
    );

    expect(units[0]?.paragraphs.at(-1)).toBe("5. M. W. = y + x + P. P.");
  });
});

describe("parseArchiveOcrWork, pages alike", () => {
  const body = [
    "Abraham, Karl, Klinische Beiträge zur Psychoanalyse aus den Jahren",
    "Adler, Alfred, Über den nervösen Charakter, Grundzüge einer vergleichenden",
    "Individualpsychologie und Psychotherapie, Wiesbaden bei Bergmann",
    "Andreas-Salomé, Lou, Narzißmus als Doppelrichtung, Imago siebenter Jahrgang",
    "Bleuler, Eugen, Dementia praecox oder Gruppe der Schizophrenien, Leipzig",
    "Breuer, Josef, und Freud, Studien über Hysterie, Wien bei Deuticke",
    "Ferenczi, Sándor, Entwicklungsstufen des Wirklichkeitssinnes, Zeitschrift",
    "Jones, Ernest, Papers on Psycho-Analysis, London bei Baillière, Tindall",
    "Jung, Carl Gustav, Wandlungen und Symbole der Libido, Jahrbuch für",
    "Rank, Otto, Der Künstler, Ansätze zu einer Sexualpsychologie, Wien",
    "Reik, Theodor, Probleme der Religionspsychologie, erster Teil, Leipzig",
    "Sachs, Hanns, Gemeinsame Tagträume, Vortrag auf dem sechsten Kongreß",
    "Silberer, Herbert, Probleme der Mystik und ihrer Symbolik, Heller",
    "Stekel, Wilhelm, Nervöse Angstzustände und ihre Behandlung, Berlin",
    "Tausk, Viktor, Über die Entstehung des Beeinflussungsapparates",
    "Wittels, Fritz, Sigmund Freud, der Mann, die Lehre, die Schule",
    "Pfister, Oskar, Die psychanalytische Methode, Pädagogium, Klinkhardt",
    "Putnam, James, Addresses on Psychoanalysis, International Library",
  ];
  const page = (leaf: number, head: string): string =>
    `<div class='ocr_page' id='page_${String(leaf).padStart(6, "0")}' title='bbox 0 0 4000 6000'>
 <p class='ocr_par'><span class='ocr_line' title='bbox 1900 300 2100 400; x_size 85'>${head}</span></p>
 <p class='ocr_par'>${body.map((text, line) => `<span class='ocr_line' title='bbox ${line % 3 === 0 ? 560 : 451} ${800 + line * 120} 3550 ${900 + line * 120}; x_size 90'>${text}</span>`).join("\n")}</p>
</div>`;
  const paragraphs = (heads: [string, string]): string[] =>
    parseArchiveOcrWork(
      `<html><body>${page(0, heads[0])}${page(1, heads[1])}</body></html>`,
      {
        item: "register",
        title: "Verzeichnis",
        citation: "Register",
        firstPage: 466,
        lastPage: 467,
      },
    ).flatMap((unit) => unit.paragraphs);

  it("keeps pages alike in their words whose heads number them apart, as an index's are", () => {
    expect(paragraphs(["466", "467"])).toHaveLength(12);
  });
});

describe("a volume that numbers its columns", () => {
  /** A page of two columns, its head numbering both: 723 … 724. */
  const columnPage = (leaf: number, left: number | null): string =>
    [
      `<div class='ocr_page' id='page_${leaf}' title='bbox 0 0 2000 3000'>`,
      `<span class='ocr_line' title='bbox 100 100 1900 160; x_size 50'>${
        left === null
          ? "STICHWORT — STICHWORT."
          : `${left} STICHWORT — STICHWORT. ${left + 1}`
      }</span>`,
      ...Array.from(
        { length: 8 },
        (_, line) =>
          `<span class='ocr_line' title='bbox 100 ${300 + line * 80} 950 ${350 + line * 80}; x_size 50'>Spalte auf Blatt ${leaf} mit Text in der Zeile ${line} hier</span>`,
      ),
      "</div>",
    ].join("\n");
  const hocr = `<html><body>\n${[
    columnPage(0, 719),
    columnPage(1, 721),
    columnPage(2, 723),
    columnPage(3, null),
    columnPage(4, 727),
    columnPage(5, 729),
  ].join("\n")}\n</body></html>`;

  it("numbers each page by its first column, two to a page", () => {
    expect(workPages(hocr, { firstPage: 721, lastPage: 727 })).toEqual([
      721, 723, 725, 727,
    ]);
    expect(pageText(hocr, 725)).toContain("Spalte auf Blatt 3");
  });

  it("knows a head the OCR read as its two numbers and its title apart", () => {
    const apart = hocr.replace(
      /(<span class='ocr_line' title='bbox 100 100 1900 160; x_size 50'>)(\d+) (STICHWORT — STICHWORT\.) (\d+)<\/span>/gu,
      "<span class='ocr_line' title='bbox 100 100 300 160; x_size 50'>$2</span>\n<span class='ocr_line' title='bbox 700 100 1300 160; x_size 50'>$3</span>\n<span class='ocr_line' title='bbox 1700 100 1900 160; x_size 50'>$4</span>",
    );

    expect(workPages(apart, { firstPage: 721, lastPage: 727 })).toEqual([
      721, 723, 725, 727,
    ]);
  });
});

describe("a volume whose front matter no head numbers", () => {
  /** A page of text, its running head numbering it where it has one. */
  const textPage = (leaf: number, head: string | null, words: string): string =>
    [
      `<div class='ocr_page' id='page_${leaf}' title='bbox 0 0 2000 3000'>`,
      ...(head === null
        ? []
        : [
            `<span class='ocr_line' title='bbox 200 100 1800 160; x_size 50'>${head}</span>`,
          ]),
      ...Array.from(
        { length: 8 },
        (_, line) =>
          `<span class='ocr_line' title='bbox 200 ${300 + line * 80} 1800 ${350 + line * 80}; x_size 50'>${words} in der Zeile ${line} und noch mehr Worte hier</span>`,
      ),
      "</div>",
    ].join("\n");
  const hocr = `<html><body>\n${[
    textPage(0, null, "Titelblatt"),
    textPage(1, null, "Vorwort zur zweiten Auflage"),
    textPage(2, null, "Erstes Kapitel"),
    textPage(3, "2 Die sexuellen Abirrungen.", "Weiter im Text"),
    textPage(4, "Die sexuellen Abirrungen. 3", "Noch weiter"),
    // A line of the text the OCR read with a roman numeral before it.
    textPage(5, null, "I großen Verbreitung"),
    textPage(6, "Die sexuellen Abirrungen. 5", "Am Ende"),
  ].join("\n")}\n</body></html>`;

  it("numbers its pages in roman from the page the scan's reading states", () => {
    const named = hocr.replace(
      "id='page_1' title='bbox 0 0 2000 3000'>",
      "$&<span class='ocr_pageno'>III</span>",
    );

    expect(workPages(named, { firstPage: "III", lastPage: "III" })).toEqual([
      "III",
    ]);
    expect(pageText(named, "III")).toContain("Vorwort zur zweiten Auflage");
  });

  it("takes no line of the text for a roman head", () => {
    expect(() => workPages(hocr, { firstPage: "I", lastPage: "I" })).toThrow(
      "No page I",
    );
  });
});

describe("a volume set in two columns", () => {
  /** A line of words, each placed where the OCR read it. */
  const line = (y: number, words: Array<[number, string]>): string => {
    const right = (words.at(-1)?.[0] ?? 0) + 300;
    return `<span class='ocr_line' title='bbox ${words[0]?.[0] ?? 0} ${y} ${right} ${y + 50}; x_size 50'>${words
      .map(
        ([x, word]) =>
          `<span class='ocrx_word' title='bbox ${x} ${y} ${x + 280} ${y + 50}'>${word}</span>`,
      )
      .join(" ")}</span>`;
  };
  const column = (
    x: number,
    side: string,
    y: number,
  ): Array<[number, string]> => [
    [x, side],
    [x + 300, "Spalte"],
    [x + 600, `Zeile${y}`],
  ];
  const page = (leaf: number, left: number): string =>
    [
      `<div class='ocr_page' id='page_${leaf}' title='bbox 0 0 2000 3000'>`,
      line(100, [[100, String(left)]]),
      line(100, [[800, "STICHWORT."]]),
      line(100, [[1700, String(left + 1)]]),
      ...Array.from({ length: 8 }, (_, row) => {
        const y = 300 + row * 80;
        // The OCR runs the third row of both columns together, and on the
        // fourth the right column starts left of where it mostly does.
        return row === 2
          ? line(y, [...column(100, "Links", y), ...column(1100, "Rechts", y)])
          : row === 4
            ? [
                line(y, column(100, "Links", y)),
                // A right column's line set out left of the others.
                line(y, [
                  [1000, "Rechts"],
                  [1300, "Spalte"],
                  [1600, `Zeile${y}`],
                ]),
              ].join("\n")
            : row === 3
              ? line(y, [
                  [100, "Links"],
                  [400, "Spalte"],
                  [700, "breit"],
                  [1040, "Rechts"],
                  [1340, "Spalte"],
                  [1640, `Zeile${y}`],
                ])
              : [
                  line(y, column(100, "Links", y)),
                  line(y, column(1100, "Rechts", y)),
                ].join("\n");
      }),
      "</div>",
    ].join("\n");
  const hocr = withVolumeReading(
    `<html><body>\n${[page(0, 719), page(1, 721), page(2, 723), page(3, 725)].join("\n")}\n</body></html>`,
    { columns: true },
  );

  it("reads each page down its left column, then its right", () => {
    const lines = pageText(hocr, 723).split("\n");

    expect(lines.slice(0, 8).every((text) => text.startsWith("Links"))).toBe(
      true,
    );
    expect(lines.slice(8).every((text) => text.startsWith("Rechts"))).toBe(
      true,
    );
    expect(lines).toHaveLength(16);
    expect(workPages(hocr, { firstPage: 721, lastPage: 725 })).toEqual([
      721, 723, 725,
    ]);
  });
});

describe("a note that runs on below the next page's heading", () => {
  const line = (y: number, text: string): string =>
    `<span class='ocr_line' title='bbox 200 ${y} 1800 ${y + 50}; x_size 50'>${text}</span>`;
  const textPage = (leaf: number, head: number, lines: string[]): string =>
    [
      `<div class='ocr_page' id='page_${leaf}' title='bbox 0 0 2000 3000'>`,
      line(100, `— ${head} —`),
      ...lines.map((text, at) => line(300 + at * 80, text)),
      "</div>",
    ].join("\n");
  const filler = (leaf: number): string[] =>
    Array.from(
      { length: 6 },
      (_, at) =>
        `Der Vortrag auf Blatt ${leaf} geht in der Zeile ${at} weiter.`,
    );
  const hocr = `<html><body>\n${[
    textPage(0, 9, filler(0)),
    textPage(1, 10, [
      ...filler(1),
      "So endet der Satz, den die Anmerkung erklärt¹).",
      "¹) Eine Anmerkung des Übersetzers, die auf",
    ]),
    textPage(2, 11, [
      "Zweite Vorlesung.",
      ...filler(2),
      "der nächsten Seite weitergeht.",
    ]),
    textPage(3, 12, filler(3)),
  ].join("\n")}\n</body></html>`;

  it("joins the line to the note it runs on, under that note's passage", () => {
    const units = parseArchiveOcrWork(hocr, {
      item: "vortraege",
      title: "Anmerkungen",
      citation: "Vorträge",
      firstPage: 10,
      lastPage: 11,
      notesOnly: true,
      notesNamed: true,
      headings: [{ page: 11, opens: "Zweite Vorlesung", level: 1 }],
      notes: [
        { page: 10, opens: "¹) Eine Anmerkung" },
        { page: 11, opens: "der nächsten Seite", runsOn: true },
      ],
    });

    expect(units.map((unit) => unit.paragraphs)).toEqual([
      [
        "¹) Eine Anmerkung des Übersetzers, die auf der nächsten Seite weitergeht.",
      ],
    ]);
  });
});

describe("a note's passage that holds an abbreviation", () => {
  const line = (y: number, text: string): string =>
    `<span class='ocr_line' title='bbox 200 ${y} 1800 ${y + 50}; x_size 50'>${text}</span>`;
  const textPage = (leaf: number, head: number, lines: string[]): string =>
    [
      `<div class='ocr_page' id='page_${leaf}' title='bbox 0 0 2000 3000'>`,
      line(100, `— ${head} —`),
      ...lines.map((text, at) => line(300 + at * 80, text)),
      "</div>",
    ].join("\n");
  const filler = (leaf: number): string[] =>
    Array.from(
      { length: 6 },
      (_, at) =>
        `Der Vortrag auf Blatt ${leaf} geht in der Zeile ${at} weiter.`,
    );
  const hocr = `<html><body>\n${[
    textPage(0, 9, filler(0)),
    textPage(1, 10, [
      ...filler(1),
      "Sie thun im Schlaf, was sie sonst thun, wie z. B. ihre Aufgaben schreiben¹).",
      "Selten zögert sie bis zum 15. Jahr und ist dann besonders²).",
      "¹) Die Heinzelmännchen!",
      "²) Eine zweite Anmerkung.",
    ]),
    textPage(2, 11, filler(2)),
  ].join("\n")}\n</body></html>`;

  it("runs the passage on past a stop that ends an abbreviation or an ordinal", () => {
    const units = parseArchiveOcrWork(hocr, {
      item: "vortraege",
      title: "Anmerkungen",
      citation: "Vorträge",
      firstPage: 10,
      lastPage: 10,
      notesOnly: true,
      notesNamed: true,
      notes: [
        { page: 10, opens: "¹) Die Heinzel" },
        { page: 10, opens: "²) Eine zweite" },
      ],
    });

    expect(units.map((unit) => unit.title)).toEqual([
      "Sie thun im Schlaf, was sie sonst thun, wie z. B. ihre Aufgaben schreiben",
      "Selten zögert sie bis zum 15. Jahr und ist dann besonders",
    ]);
  });
});

describe("a note set to a heading, its mark a bare superscript", () => {
  const line = (y: number, text: string, size = 50): string =>
    `<span class='ocr_line' title='bbox 200 ${y} 1800 ${y + size}; x_size ${size}'>${text}</span>`;
  const hocr = `<html><body>\n${[
    [
      "<div class='ocr_page' id='page_0' title='bbox 0 0 2000 3000'>",
      line(100, "— 9 —"),
      ...Array.from({ length: 6 }, (_, at) =>
        line(
          300 + at * 80,
          `Der Vortrag auf Blatt 0 geht in der Zeile ${at} weiter.`,
        ),
      ),
      "</div>",
    ].join("\n"),
    [
      "<div class='ocr_page' id='page_1' title='bbox 0 0 2000 3000'>",
      line(100, "— 10 —"),
      line(300, "Ueber einen Fall von Wortblindheit.¹", 80),
      ...Array.from({ length: 6 }, (_, at) =>
        line(
          500 + at * 80,
          `Meine Herren, der Vortrag geht in der Zeile ${at} weiter.`,
        ),
      ),
      line(1100, "¹ Die beiden Vorlesungen sind die ersten einer Reihe."),
      line(1180, "Anmerkung des Uebersetzers."),
      "</div>",
    ].join("\n"),
  ].join("\n")}\n</body></html>`;

  it("sets the note under the heading that holds its mark", () => {
    const units = parseArchiveOcrWork(hocr, {
      item: "vorlesungen",
      title: "Anmerkungen",
      citation: "Vorlesungen",
      firstPage: 10,
      lastPage: 10,
      notesOnly: true,
      notesNamed: true,
      notesSigned: ["Anmerkung des Uebersetzers."],
      headings: [{ page: 10, opens: "Ueber einen Fall", level: 1 }],
      notes: [{ page: 10, opens: "¹ Die beiden" }],
    });

    expect(units.map((unit) => [unit.title, unit.paragraphs])).toEqual([
      [
        "Ueber einen Fall von Wortblindheit.",
        [
          "¹ Die beiden Vorlesungen sind die ersten einer Reihe. Anmerkung des Uebersetzers.",
        ],
      ],
    ]);
  });
});

describe("named notes beside specks at the page's edge", () => {
  const line = (x: number, y: number, text: string): string =>
    `<span class='ocr_line' title='bbox ${x} ${y} ${x === 20 ? 30 : 1800} ${y + 50}; x_size 50'>${text}</span>`;
  const textPage = (leaf: number, head: number, lines: string[]): string =>
    [
      `<div class='ocr_page' id='page_${leaf}' title='bbox 0 0 2000 3000'>`,
      line(200, 100, `— ${head} —`),
      ...lines,
      "</div>",
    ].join("\n");
  const filler = (leaf: number): string[] =>
    Array.from({ length: 6 }, (_, at) =>
      line(
        200,
        300 + at * 80,
        `Der Vortrag auf Blatt ${leaf} geht in der Zeile ${at} weiter.`,
      ),
    );
  const hocr = `<html><body>\n${[
    textPage(0, 9, filler(0)),
    textPage(1, 10, [
      ...filler(1),
      line(200, 800, "So schliesst der Vortrag, vorstellen kann.¹"),
      line(200, 1000, "¹ Der Kranke entzog sich bald darauf der Behandlung."),
      line(20, 1020, "I"),
      line(200, 1080, "Anmerkung des Uebersetzers."),
      line(20, 1100, "i"),
      line(200, 1140, "ELE ET"),
      line(200, 1200, "lllllll.llllllllllll AA L}"),
    ]),
    textPage(2, 11, filler(2)),
  ].join("\n")}\n</body></html>`;

  it("leaves out a line without a word the OCR read among the notes", () => {
    const units = parseArchiveOcrWork(hocr, {
      item: "vorlesungen",
      title: "Anmerkungen",
      citation: "Vorlesungen",
      firstPage: 10,
      lastPage: 10,
      notesOnly: true,
      notesNamed: true,
      notesSigned: ["Anmerkung des Uebersetzers."],
      notes: [{ page: 10, opens: "¹ Der Kranke" }],
    });

    expect(units.flatMap((unit) => unit.paragraphs)).toEqual([
      "¹ Der Kranke entzog sich bald darauf der Behandlung. Anmerkung des Uebersetzers.",
    ]);
  });
});
