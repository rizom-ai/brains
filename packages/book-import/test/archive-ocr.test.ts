import { describe, expect, it } from "bun:test";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import {
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
  volume: "XIII",
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
    volume: "XI",
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
        volume: "X",
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
        volume: "I",
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
        volume: "II/III",
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
