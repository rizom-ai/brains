import { describe, expect, it } from "bun:test";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import {
  parseWikisourcePage,
  parseWikisourcePages,
} from "../src/adapters/wikisource";

async function briefwechsel(): Promise<string> {
  return readFile(
    join(import.meta.dir, "fixtures", "wikisource-briefwechsel.html"),
    "utf8",
  );
}

const work = {
  page: "Ein Briefwechsel von 1843",
  citation: "Briefwechsel",
  skipHeadings: ["R. an M."],
};

describe("parseWikisourcePage", () => {
  it("reads each centred heading as a section, cited by work and printed page", async () => {
    const units = parseWikisourcePage(await briefwechsel(), work);

    expect(
      units.map((unit) => [unit.parents, unit.title, unit.section]),
    ).toEqual([
      [[], "I. Die Briefe.", "Briefwechsel, 17"],
      [[], "M. an R.", "Briefwechsel, 17"],
      [[], "M. an R.", "Briefwechsel, 18"],
    ]);
    expect(units[1]?.source).toBe(
      "https://de.wikisource.org/wiki/Ein_Briefwechsel_von_1843#Seite_17",
    );
  });

  it("reads paragraphs as printed, emphasis marked, Wikisource's own notes left out", async () => {
    const units = parseWikisourcePage(await briefwechsel(), work);

    expect(units[1]?.paragraphs).toEqual([
      "Auf Treckschuit nach D. im Mærz 1843.",
      "Ich reise jetzt in Holland. Deutschland ist tief in den Dreck hineingeritten, und ich versichere Sie, man fühlt doch *Nationalscham*, sogar in Holland.",
      "Das ist auch eine Offenbarung, wenn gleich eine *umgekehrte*. Die Scham ist schon eine Revolution; der Staat ist ein zu ernstes Ding.",
    ]);
    expect(units[2]?.paragraphs).toEqual([
      "Kœln, im Mai 1843.",
      "Ihr Brief, mein theurer Freund, ist eine gute Elegie.",
    ]);
  });

  it("cases a heading set in capitals, and marks nested emphasis once", () => {
    const units = parseWikisourcePage(
      `<span class="PageNumber" id="Seite_182">[182]</span><div style="text-align:center"><big><b>ZUR JUDENFRAGE.</b></big></div><p>1) <i><span style="letter-spacing:0.2em">Bruno Bauer: Die Judenfrage.</span> Braunschweig 1843.</i></p>`,
      { page: "Zur Judenfrage", citation: "Judenfrage" },
    );

    expect(units.map((unit) => [unit.title, unit.section])).toEqual([
      ["Zur Judenfrage.", "Judenfrage, 182"],
    ]);
    // Spaced type within italics is one emphasis.
    expect(units[0]?.paragraphs).toEqual([
      "1) *Bruno Bauer: Die Judenfrage. Braunschweig 1843.*",
    ]);
  });

  it("leaves out the byline, the text data and a section the work names", async () => {
    const units = parseWikisourcePage(await briefwechsel(), work);
    const text = units.flatMap((unit) => [unit.title, ...unit.paragraphs]);

    expect(text.join("\n")).not.toMatch(/KARL MARX|Autor|besseres Lied|WS 1/);
  });
});

describe("parseWikisourcePage, a French transcription", () => {
  it("reads chapters and their sections from the work's first heading to its end, cited by page, in sentence case", async () => {
    const units = parseWikisourcePage(
      await readFile(
        join(import.meta.dir, "fixtures", "wikisource-misere.html"),
        "utf8",
      ),
      {
        page: "Misère de la philosophie/Texte entier",
        citation: "Misère",
        site: "fr.wikisource.org",
        from: "Chapitre premier",
        until: "Appendice I",
        textHeadings: [
          "Et propter vitam vivendi perdere causas !",
          "Variante.",
        ],
      },
    );

    expect(
      units.map((unit) => [unit.parents, unit.title, unit.section]),
    ).toEqual([
      [
        ["Chapitre premier. Une découverte scientifique"],
        "§ Ier. — opposition de la valeur d’utilité et de la valeur d’échange",
        "Misère, 37",
      ],
      [
        ["Chapitre premier. Une découverte scientifique"],
        "§ II. La valeur constituée.",
        "Misère, 37",
      ],
      [
        [
          "Chapitre II. La métaphysique de l’économie politique",
          "§ Ier. — la méthode.",
        ],
        "§ Ier. — la méthode.",
        "Misère, 38",
      ],
      [
        [
          "Chapitre II. La métaphysique de l’économie politique",
          "§ Ier. — la méthode.",
        ],
        "Première observation.",
        "Misère, 38",
      ],
    ]);
    expect(units[0]?.paragraphs).toEqual([
      "« La capacité qu’ont tous les produits de servir à la subsistance de l’homme. »",
      "Et propter vitam vivendi perdere causas !",
      "Nous arrivons maintenant à une nouvelle détermination.",
    ]);
    expect(units[0]?.source).toBe(
      "https://fr.wikisource.org/wiki/Mis%C3%A8re_de_la_philosophie%2FTexte_entier#37",
    );
  });

  it("keeps the printed notes the page gives as references, marked where they stand, a heading's with its section, but not the editors'", async () => {
    const units = parseWikisourcePage(
      await readFile(
        join(import.meta.dir, "fixtures", "wikisource-misere.html"),
        "utf8",
      ),
      {
        page: "Misère de la philosophie/Texte entier",
        citation: "Misère",
        site: "fr.wikisource.org",
        from: "Chapitre premier",
        until: "Appendice I",
        textHeadings: [
          "Et propter vitam vivendi perdere causas !",
          "Variante.",
        ],
        printedNotes: true,
        skipNotes: ["Ce passage a été corrigé"],
      },
    );

    expect(units[1]?.paragraphs).toEqual([
      "La valeur est le rapport.2)",
      "1) Ou la valeur synthétique.",
      "2) Comme toute autre théorie, celle de M. Bray a trouvé ses partisans : avis à M. *Proudhon* !",
    ]);
    expect(units[1]?.title).toBe("§ II. La valeur constituée.");
    expect(units[2]?.paragraphs).toEqual(["Nous voici en pleine Allemagne !"]);
  });

  it("reads a title set over two headings as one", async () => {
    const units = parseWikisourcePage(
      await readFile(
        join(import.meta.dir, "fixtures", "wikisource-misere.html"),
        "utf8",
      ),
      {
        page: "Misère de la philosophie/Texte entier",
        citation: "Libre-échange",
        site: "fr.wikisource.org",
        from: "Discours",
        textHeadings: ["Prononcé"],
      },
    );

    expect(
      units.map((unit) => [unit.parents, unit.title, unit.paragraphs]),
    ).toEqual([
      [
        [],
        "Discours sur la question du libre-échange",
        ["PRONONCÉ", "Messieurs, l’abolition des lois céréales."],
      ],
    ]);
  });

  it("reads a quotation set as an indented block, a line centred in it kept as text", async () => {
    const units = parseWikisourcePage(
      await readFile(
        join(import.meta.dir, "fixtures", "wikisource-misere.html"),
        "utf8",
      ),
      {
        page: "Misère de la philosophie/Texte entier",
        citation: "Misère",
        site: "fr.wikisource.org",
        from: "Chapitre premier",
        until: "Appendice I",
        textHeadings: [
          "Et propter vitam vivendi perdere causas !",
          "Variante.",
        ],
      },
    );

    expect(units[3]?.paragraphs).toEqual([
      "Les catégories économiques.",
      "« La division du travail est un instrument de misère. » (Tome 1er, p. 94.)",
      "variante.",
      "« Le travail, en se *divisant*, se détruit lui-même. »",
    ]);
  });
});

describe("parseWikisourcePage, an editor's headings", () => {
  it("leaves out the centred lines an editor set, their text running on under the heading above", async () => {
    const units = parseWikisourcePage(
      await readFile(
        join(import.meta.dir, "fixtures", "wikisource-misere.html"),
        "utf8",
      ),
      {
        page: "Misère de la philosophie/Texte entier",
        citation: "Misère",
        site: "fr.wikisource.org",
        from: "Chapitre premier",
        until: "Appendice I",
        textHeadings: [
          "Et propter vitam vivendi perdere causas !",
          "Variante.",
        ],
        omitHeadings: ["Première observation."],
      },
    );

    expect(units.map((unit) => unit.title)).toEqual([
      "§ Ier. — opposition de la valeur d’utilité et de la valeur d’échange",
      "§ II. La valeur constituée.",
      "§ Ier. — la méthode.",
    ]);
    expect(units[2]?.paragraphs).toContain("Les catégories économiques.");
  });
});

describe("parseWikisourcePages, a work set out over several pages", () => {
  it("reads the pages as one work, each part cited from the page it is on, a rule parting a centred block, an editor's caption left out line by line, English capitals as printed", async () => {
    const read = (name: string): Promise<string> =>
      readFile(join(import.meta.dir, "fixtures", name), "utf8");
    const units = parseWikisourcePages(
      [
        {
          page: "The Civil War in France (1871)/Chapter 1",
          html: await read("wikisource-civil-war-1.html"),
        },
        {
          page: "The Civil War in France (1871)/Notes",
          html: await read("wikisource-civil-war-notes.html"),
        },
      ],
      {
        page: "The Civil War in France (1871)",
        citation: "Civil War",
        site: "en.wikisource.org",
        textHeadings: [
          "To all the members of the Association in Europe and the United States.",
        ],
        omitHeadings: [
          "The Declaration of War",
          "First manifesto of the General Council",
        ],
      },
    );

    expect(
      units.map((unit) => [unit.title, unit.section, unit.source]),
    ).toEqual([
      [
        "Civil War, 3",
        "Civil War, 3",
        "https://en.wikisource.org/wiki/The_Civil_War_in_France_(1871)%2FChapter_1#3",
      ],
      [
        "I.",
        "Civil War, 3",
        "https://en.wikisource.org/wiki/The_Civil_War_in_France_(1871)%2FChapter_1#3",
      ],
      [
        "NOTES. I.",
        "Civil War, 33",
        "https://en.wikisource.org/wiki/The_Civil_War_in_France_(1871)%2FNotes#33",
      ],
    ]);
    expect(units[0]?.paragraphs).toEqual([
      "TO ALL THE MEMBERS OF THE ASSOCIATION IN EUROPE AND THE UNITED STATES.",
    ]);
    expect(units[1]?.paragraphs).toEqual([
      "On the 4th of September, 1870, the working men of Paris proclaimed the Republic.",
      "When the Assembly had met at Bordeaux, Thiers told the admiring Frankfort Philistines.",
    ]);
    expect(units[2]?.paragraphs).toEqual([
      '"The column of prisoners halted in the Avenue Uhrich."—*Daily News*, June 8th.',
      "I am, Sir, your obedient servant,",
      '"John Hales."',
    ]);
  });
});
