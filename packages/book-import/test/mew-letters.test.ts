import { describe, expect, it } from "bun:test";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import {
  mewPageNumbers,
  parseMewLetters,
  type MewLetters,
} from "../src/adapters/mew-letters";
import type { BookUnit } from "../src/render-book";

/** The running heads of PDF pages 415–418 of MEW 30, as Tesseract reads them. */
const heads = new Map([
  [415, "209 + Engels an Marx * 3. Januar 1864 385"],
  [416, "386 210 * Marx an Engels * 20. Januar 1864"],
  [417, "210 - Marx an Engels * 20. Januar 1864 387"],
  [418, "388 211 + Marx an Engels * 25. Februar 1864"],
]);

const letters = async (
  years: { from?: number; to?: number } = {},
): Promise<ReturnType<typeof parseMewLetters>> =>
  parseMewLetters(
    await readFile(join(import.meta.dir, "fixtures", "mew-30-415.xml"), "utf8"),
    heads,
    {
      volume: 30,
      file: "mew_band30",
      item: "Marx_Engels_Werke_MEW",
      writer: "Marx",
      ...years,
    },
  );

describe("parseMewLetters", () => {
  it("reads the writer's letters, each under its year, titled by its heading and cited by MEW page", async () => {
    const units = await letters();

    expect(
      units.map((unit) => [unit.parents, unit.title, unit.section]),
    ).toEqual([
      [
        ["1864"],
        "An Engels in Manchester. Zalt-Bommel, 20. Januar 1864",
        "MEW 30, 386",
      ],
      [
        ["1864"],
        "An Engels in Manchester. London, 25. Febr. 1864",
        "MEW 30, 388",
      ],
    ]);
    expect(units[0]?.source).toBe(
      "https://archive.org/details/Marx_Engels_Werke_MEW/mew_band30/page/n415",
    );
  });

  it("reads a letter's text without the editors' marks and notes, its broken words joined, its emphasis kept", async () => {
    const units = await letters();
    const second = units[1]?.paragraphs ?? [];

    expect(second.slice(0, 3)).toEqual([
      "London, 25. Febr. 1864",
      "Dear Frederick,",
      "Diese Zeilen einstweilen vorläufig, um Dir meine Rückkehr anzuzeigen. Sobald das Wetter es erlaubt, komme ich auf *2 Tage* nach Manchester, um Dich persönlich wiederzusehn und Dir zugleich über meine affairs zu berichten.",
    ]);
    expect(second.at(-1)).toBe("Dein *K.M.*");
    expect(units[0]?.paragraphs.join("\n")).toContain(
      "Und wenn er keinen Hintern hat, wie will der Edle sitzen. Dies ist nun das schmerzlichste",
    );
    expect(units[0]?.paragraphs.join("\n")).toContain(
      "versprochen, und wie soll sie an unsre Orestes-Pyladesschaft glauben,",
    );
  });

  it("parts a recipient and a dateline the OCR read as one line", async () => {
    const units = await letters();

    expect(units[0]?.paragraphs.slice(0, 2)).toEqual([
      "Zalt-Bommel, 20. Januar 1864",
      "Lieber Frederick,",
    ]);
  });

  it("keeps the letters of the years asked", async () => {
    expect(await letters({ from: 1865 })).toEqual([]);
    expect(await letters({ to: 1864 })).toHaveLength(2);
  });
});

describe("parseMewLetters, openings the text layer misreads", () => {
  /** A page of the text layer: a letter's number, heading, and the lines under it, the text 14 points, headings 17. */
  const page = (lines: Array<[number, number, string]>): string =>
    `<pdf2xml><page number="40">
<fontspec id="0" size="14" family="Garamond"/>
<fontspec id="1" size="17" family="Garamond"/>
${lines.map(([left, size, text]) => `<text top="9" left="${left}" width="${Math.min(440, text.length * 7)}" height="16" font="${size === 17 ? 1 : 0}">${text}</text>`).join("\n")}
<text top="9" left="60" width="440" height="16" font="0">Ich schreibe Dir heute nur kurz, da ich wenig Zeit habe und morgen mehr.</text>
<text top="9" left="40" width="440" height="16" font="0">Es geht uns allen gut, und die Kinder lassen Dich herzlich grüßen, wie immer.</text>
</page></pdf2xml>`;
  const opened = (
    lines: Array<[number, number, string]>,
    head = "12 4 + Marx an Engels * 28. Januar 1860",
  ): Array<[string[], string, string | undefined]> =>
    parseMewLetters(page(lines), new Map([[40, head]]), {
      volume: 30,
      file: "mew_band30",
      item: "Marx_Engels_Werke_MEW",
      writer: "Marx",
    }).map((unit) => [unit.parents, unit.title, unit.paragraphs[1]]);

  it("parts a dateline the OCR ran into the recipient's place, by a capital or a bracket", () => {
    expect(
      opened([
        [278, 14, "4"],
        [233, 17, "Marx an Engels"],
        [240, 14, "in ManchesterLondon, 2. Februar 1861"],
        [89, 14, "Lieber Frederick,"],
      ]),
    ).toEqual([
      [
        ["1861"],
        "An Engels in Manchester. London, 2. Februar 1861",
        "Lieber Frederick,",
      ],
    ]);
    expect(
      opened([
        [278, 14, "4"],
        [233, 17, "Marx an Louis Watteau"],
        [240, 14, "in Brüssel[London] 10. November 1861"],
        [89, 14, "Lieber Bürger,"],
      ])[0]?.[1],
    ).toBe("An Louis Watteau in Brüssel. [London] 10. November 1861");
  });

  it("parts a recipient's place from the dateline at the first place a date follows", () => {
    expect(
      opened([
        [278, 14, "4"],
        [233, 17, "Marx an Engels"],
        [240, 14, "in Manchester London, 12. Dez.. [1860]"],
        [89, 14, "Lieber Engels,"],
      ])[0]?.[1],
    ).toBe("An Engels in Manchester. London, 12. Dez.. [1860]");
  });

  it("reads the OCR's I, l and H for a date's digits and 0 for a month's O: I3ten, H.November, 186I, 13.0ktober", () => {
    const titled = (date: string): string | undefined =>
      opened([
        [278, 14, "4"],
        [233, 17, "Marx an Engels"],
        [240, 14, "in Manchester"],
        [370, 14, date],
        [89, 14, "Lieber Engels,"],
      ])[0]?.[1];

    expect(titled("London, I3ten Februar 1860")).toBe(
      "An Engels in Manchester. London, 13ten Februar 1860",
    );
    expect(titled("[London, H.November 1862]")).toBe(
      "An Engels in Manchester. [London, 11.November 1862]",
    );
    expect(titled("Trier, den lOten Februar [1842]")).toBe(
      "An Engels in Manchester. Trier, den 10ten Februar [1842]",
    );
    expect(titled("Bruxelles [24. März 1845J")).toBe(
      "An Engels in Manchester. Bruxelles [24. März 1845]",
    );
    expect(titled("[London] I.Dezember 1851")).toBe(
      "An Engels in Manchester. [London] 1.Dezember 1851",
    );
    expect(titled("[London] 28. September1853")).toBe(
      "An Engels in Manchester. [London] 28. September 1853",
    );
    expect(titled("[London] 6.Nov.186I")).toBe(
      "An Engels in Manchester. [London] 6.Nov.1861",
    );
    expect(titled("[London] 13.0ktober 1851")).toBe(
      "An Engels in Manchester. [London] 13.Oktober 1851",
    );
  });

  it("keeps a place of more than one word whole, parted from the dateline at the first place a dateline opens", () => {
    expect(
      opened([
        [278, 14, "4"],
        [233, 17, "Marx an Joseph Weydemeyer"],
        [240, 14, "in Frankfurt a. M. Paris, 13.Juli [1849]"],
        [89, 14, "Lieber Weydemeyer!"],
      ])[0]?.[1],
    ).toBe("An Joseph Weydemeyer in Frankfurt a. M. Paris, 13.Juli [1849]");
  });

  it("leaves out the OCR's stray marks in a heading and a recipient's place", () => {
    expect(
      opened([
        [278, 14, "4"],
        [233, 17, "Marx an Engels •"],
        [240, 14, "in Bern;"],
        [370, 14, "Köln, 29. November 48"],
        [89, 14, "Lieber Engels!"],
      ])[0]?.[1],
    ).toBe("An Engels in Bern. Köln, 29. November 48");
  });

  it("reads a French month, a year run on into it, and a place of two words before a date", () => {
    const dated = (place: string, date: string): string | undefined =>
      opened([
        [278, 14, "4"],
        [233, 17, "Marx an Engels"],
        [240, 14, place],
        [370, 14, date],
        [89, 14, "Dear Fred,"],
      ])[0]?.[1];

    expect(dated("in London", "[Argenteuil] Jeudi, 3 Aoüt82")).toBe(
      "An Engels in London. [Argenteuil] Jeudi, 3 Aoüt 82",
    );
    expect(
      opened([
        [278, 14, "4"],
        [233, 17, "Marx an Engels"],
        [240, 14, "in London"],
        [370, 14, "Cannes, 5 Juin 82"],
        [89, 14, "Dear Fred,"],
        [278, 14, "5"],
        [233, 17, "Marx an Engels"],
        [240, 14, "in London"],
        [370, 14, "Cannes, 20. Mai 82"],
        [89, 14, "Dear Fred,"],
      ]).map(([, title]) => title),
    ).toEqual([
      "An Engels in London. Cannes, 20. Mai 82",
      "An Engels in London. Cannes, 5 Juin 82",
    ]);
    expect(dated("in Bridlington Quay 3. August 1881", "")).toBe(
      "An Engels in Bridlington Quay. 3. August 1881",
    );
  });

  it("takes no line of the text for a dateline, its date late in the line or the line opening in small letters", () => {
    const titled = (text: string): string | undefined =>
      opened([
        [278, 14, "4"],
        [233, 17, "Marx an Engels"],
        [240, 14, "in Ramsgate"],
        [89, 14, text],
      ])[0]?.[1];

    expect(
      titled(
        "den ich eigenhändig, präsente Dr. Gans junior, am 18. August auf dem",
      ),
    ).toBe("An Engels in Ramsgate");
    expect(titled('der „N[euen] Rh[einischen] Z[eitung]" d. 28.Februar)')).toBe(
      "An Engels in Ramsgate",
    );
    expect(titled("den 10ten November [1837]")).toBe(
      "An Engels in Ramsgate. den 10ten November [1837]",
    );
    expect(
      titled(
        'An J.B. v. Schweitzer („Soc[ial]-Dem[okrat]") London, 16. Jan. 1865',
      ),
    ).toBe("An Engels in Ramsgate. London, 16. Jan. 1865");
    expect(titled("[Karlsbad, Ende August/Anfang September 1876]")).toBe(
      "An Engels in Ramsgate. [Karlsbad, Ende August/Anfang September 1876]",
    );
  });

  it("looks for a dateline no further than the salutation, a letter without one titled by its heading", () => {
    expect(
      opened([
        [278, 14, "4"],
        [233, 17, "Marx an Engels"],
        [240, 14, "in London"],
        [370, 14, "Mittwoch"],
        [89, 14, "Dear Fred,"],
        [
          89,
          14,
          "Zunächst nun Gesundheitsbericht. Meine Kur begann 17ten Juni. Das",
        ],
      ])[0]?.[1],
    ).toBe("An Engels in London");
  });

  it("reads a recipient's place behind a stray mark, misread as m or in., or in the editors' brackets", () => {
    const titled = (place: string): string | undefined =>
      opened([
        [278, 14, "4"],
        [233, 17, "Marx an Engels"],
        [240, 14, place],
        [89, 14, "Lieber Engels!"],
      ])[0]?.[1];

    expect(titled("• in Manchester [London] 25.Oktober 1851")).toBe(
      "An Engels in Manchester. [London] 25.Oktober 1851",
    );
    expect(titled("m Manchester [London] 28. April 1853")).toBe(
      "An Engels in Manchester. [London] 28. April 1853",
    );
    expect(titled("in. Manchester 18. März [1857]")).toBe(
      "An Engels in Manchester. 18. März [1857]",
    );
    expect(titled("[in London] [London] 15. Juni 1857")).toBe(
      "An Engels [in London]. [London] 15. Juni 1857",
    );
  });

  it("sets a heading's quotation marks as German ones and reads a dateline's closing brace as a bracket", () => {
    expect(
      opened([
        [278, 14, "4"],
        [233, 17, 'Marx an die Redaktion der "Allgemeinen Zeitung"'],
        [240, 14, "in Augsburg"],
        [370, 14, "[London, Anfang Dezember 1851}"],
        [89, 14, "Herr Redakteur!"],
      ])[0]?.[1],
    ).toBe(
      "An die Redaktion der „Allgemeinen Zeitung“ in Augsburg. [London, Anfang Dezember 1851]",
    );
  });

  it("leaves out the OCR's stray marks before a dateline and reads its brace as a bracket", () => {
    const titled = (date: string): string | undefined =>
      opened([
        [278, 14, "4"],
        [233, 17, "Marx an Engels"],
        [240, 14, "in Manchester"],
        [370, 14, date],
        [89, 14, "Lieber Engels!"],
      ])[0]?.[1];

    expect(titled("'' [London] 31.Juli 1865")).toBe(
      "An Engels in Manchester. [London] 31.Juli 1865",
    );
    expect(titled(",..„ [London] 15.Dez. 1881")).toBe(
      "An Engels in Manchester. [London] 15.Dez. 1881",
    );
    expect(titled("{London] 18. Juli 1853")).toBe(
      "An Engels in Manchester. [London] 18. Juli 1853",
    );
  });

  it("parts a dateline from the salutation and text the OCR ran on into it, its bracket read as 1", () => {
    expect(
      opened([
        [278, 14, "4"],
        [233, 17, "Marx an Heinrich Börnstein"],
        [240, 14, "in Paris"],
        [89, 14, "[Paris, Herbst 18441 Verehrter Herr! Schicken Sie mir"],
      ]),
    ).toEqual([
      [
        ["1844"],
        "An Heinrich Börnstein in Paris. [Paris, Herbst 1844]",
        "Verehrter Herr! Schicken Sie mir",
      ],
    ]);
  });

  it("parts a short heading from a dateline set beside it in the text's type", () => {
    expect(
      opened([
        [278, 14, "4"],
        [233, 17, "Marx an Adolf Cluß"],
        [365, 14, "[London] 7 Dec. 1852-"],
        [89, 14, "Lieber Cluß!"],
      ])[0]?.slice(0, 2),
    ).toEqual([["1852"], "An Adolf Cluß. [London] 7 Dec. 1852"]);
  });

  it("keeps the editors' word on what the letter is with its heading, the dateline under it", () => {
    expect(
      opened([
        [278, 14, "4"],
        [233, 17, "Marx an Georg Lommel"],
        [240, 14, "in Genf"],
        [250, 14, "(Entwurf)"],
        [370, 14, "[London] <i>9. April 1860</i>"],
        [89, 14, "Lieber Lommel,"],
      ])[0]?.[1],
    ).toBe("An Georg Lommel in Genf (Entwurf). [London] 9. April 1860");
    expect(
      opened([
        [278, 14, "4"],
        [233, 17, "Marx an Muzembini"],
        [240, 14, "in London"],
        [250, 14, "(Entwurf)Manchester, 27. Febr. 1860"],
        [89, 14, "Lieber Freund,"],
      ])[0]?.[1],
    ).toBe("An Muzembini in London (Entwurf). Manchester, 27. Febr. 1860");
  });

  it("parts a salutation and a dateline the OCR read as one line, and a stray mark after the date", () => {
    expect(
      opened([
        [278, 14, "4"],
        [233, 17, "Marx an Engels"],
        [240, 14, "in Manchester"],
        [89, 14, "Dear Frederick, [London] 4 July 1864'"],
      ]),
    ).toEqual([
      [
        ["1864"],
        "An Engels in Manchester. [London] 4 July 1864",
        "Dear Frederick,",
      ],
    ]);
  });

  it("reads a year's 1 the OCR read as l or I, and takes the year the dateline leaves out from the page's head", () => {
    expect(
      opened([
        [278, 14, "4"],
        [233, 17, "Marx an Franz Duncker"],
        [240, 14, "in Berlin"],
        [370, 14, "London, 6.Feb.l860"],
        [89, 14, "Lieber Duncker,"],
      ])[0]?.slice(0, 2),
    ).toEqual([["1860"], "An Franz Duncker in Berlin. London, 6.Feb.1860"]);
    expect(
      opened(
        [
          [278, 14, "4"],
          [233, 17, "Marx an Engels"],
          [240, 14, "in Manchester"],
          [370, 14, "[London] 25.Juni"],
          [89, 14, "Lieber Engels,"],
        ],
        "70 34 + Marx an Engels * 25. Juni 1860",
      )[0]?.slice(0, 2),
    ).toEqual([["1860"], "An Engels in Manchester. [London] 25.Juni"]);
  });
});

describe("parseMewLetters, words the text layer ran together", () => {
  it("parts a small word from the capitalised one the OCR ran it into, a name like MacAdam and a compound like ArbeitsZeit left whole", () => {
    const xml = `<pdf2xml><page number="40">
<fontspec id="0" size="14" family="Garamond"/>
<fontspec id="1" size="17" family="Garamond"/>
<text top="9" left="278" width="10" height="16" font="0">4</text>
<text top="9" left="233" width="120" height="16" font="1">Marx an Engels</text>
<text top="9" left="240" width="90" height="16" font="0">in Manchester</text>
<text top="9" left="370" width="120" height="16" font="0">[London] 13. Jan. 1860</text>
<text top="9" left="60" width="440" height="16" font="0">Ich habe seit dreiMonate aus einemBriefe von MacAdam nichts gehört, undSchramms ArbeitsZeit</text>
<text top="9" left="40" width="440" height="16" font="0">ist am Ende doch denTag nicht wert, an dem sie erschien, wie Du weißt.</text>
</page></pdf2xml>`;

    expect(
      parseMewLetters(
        xml,
        new Map([[40, "12 4 + Marx an Engels * 13. Januar 1860"]]),
        {
          volume: 30,
          file: "mew_band30",
          item: "Marx_Engels_Werke_MEW",
          writer: "Marx",
        },
      )[0]?.paragraphs[1],
    ).toBe(
      "Ich habe seit drei Monate aus einem Briefe von MacAdam nichts gehört, und Schramms ArbeitsZeit ist am Ende doch den Tag nicht wert, an dem sie erschien, wie Du weißt.",
    );
  });
  it("reads a capital I between small letters as the l the OCR took it for, so the word is not parted there", () => {
    const xml = `<pdf2xml><page number="40">
<fontspec id="0" size="14" family="Garamond"/>
<fontspec id="1" size="17" family="Garamond"/>
<text top="9" left="278" width="10" height="16" font="0">4</text>
<text top="9" left="233" width="120" height="16" font="1">Marx an Engels</text>
<text top="9" left="240" width="90" height="16" font="0">in Manchester</text>
<text top="9" left="370" width="120" height="16" font="0">[London] 13. Jan. 1860</text>
<text top="9" left="60" width="440" height="16" font="0">Die Erlaubnis ist erteiIt. PaImerston hat am 13.JuIy nichts gesagt, und das ist alles, was ich weiß.</text>
</page></pdf2xml>`;

    expect(
      parseMewLetters(
        xml,
        new Map([[40, "12 4 + Marx an Engels * 13. Januar 1860"]]),
        {
          volume: 30,
          file: "mew_band30",
          item: "Marx_Engels_Werke_MEW",
          writer: "Marx",
        },
      )[0]?.paragraphs[1],
    ).toBe(
      "Die Erlaubnis ist erteilt. Palmerston hat am 13.July nichts gesagt, und das ist alles, was ich weiß.",
    );
  });
  it("reads the I, l and O the OCR took in a number as the 1 and 0 they are", () => {
    const xml = `<pdf2xml><page number="40">
<fontspec id="0" size="14" family="Garamond"/>
<fontspec id="1" size="17" family="Garamond"/>
<text top="9" left="278" width="10" height="16" font="0">4</text>
<text top="9" left="233" width="120" height="16" font="1">Marx an Engels</text>
<text top="9" left="240" width="90" height="16" font="0">in Manchester</text>
<text top="9" left="370" width="120" height="16" font="0">[London] 13. Jan. 1860</text>
<text top="9" left="60" width="440" height="16" font="0">Am lOten und am 3I.Mai, seit I815, am 19.0ktob. und 3Oktober, für lOOOOfrs. und den 3Ist, S. 5I7. I am sure.</text>
</page></pdf2xml>`;

    expect(
      parseMewLetters(
        xml,
        new Map([[40, "12 4 + Marx an Engels * 13. Januar 1860"]]),
        {
          volume: 30,
          file: "mew_band30",
          item: "Marx_Engels_Werke_MEW",
          writer: "Marx",
        },
      )[0]?.paragraphs[1],
    ).toBe(
      "Am 10ten und am 31.Mai, seit 1815, am 19.Oktob. und 3Oktober, für 10000frs. und den 31st, S. 517. I am sure.",
    );
  });
});

describe("parseMewLetters, letters the text layer spaced out", () => {
  it("reads words the text layer spaced out letter by letter as words, its words two spaces apart, a French y a left as it is", () => {
    const xml = `<pdf2xml><page number="40">
<fontspec id="0" size="14" family="Garamond"/>
<fontspec id="1" size="17" family="Garamond"/>
<text top="9" left="278" width="10" height="16" font="0">4</text>
<text top="9" left="198" width="222" height="16" font="1">Marx an Joseph Weydemeyer </text>
<text top="9" left="265" width="270" height="16" font="0">in  N e w York [London]  19.  D e z e m b e r 1851 </text>
<text top="9" left="60" width="440" height="16" font="0">Vorgestern erhielt ich,  d . h . Engels Deinen Brief, il y a des Fragen  u n d  W e n n  D u Zeit hast,  I I I. Freund Stieber  - 3 Tage, um  - a tout seigneur. </text>
</page></pdf2xml>`;

    const [letter] = parseMewLetters(
      xml,
      new Map([[40, "12 4 + Marx an Joseph Weydemeyer * 19. Dezember 1851"]]),
      {
        volume: 27,
        file: "mew_band27",
        item: "Marx_Engels_Werke_MEW",
        writer: "Marx",
      },
    );

    expect(letter?.title).toBe(
      "An Joseph Weydemeyer in New York. [London] 19. Dezember 1851",
    );
    expect(letter?.paragraphs[1]).toBe(
      "Vorgestern erhielt ich, d.h. Engels Deinen Brief, il y a des Fragen und Wenn Du Zeit hast, III. Freund Stieber - 3 Tage, um - a tout seigneur.",
    );
  });
});

describe("parseMewLetters, a recipient's place the text layer ran on", () => {
  const titled = (place: string): Array<string | undefined> => {
    const [letter] = parseMewLetters(
      `<pdf2xml><page number="40">
<fontspec id="0" size="14" family="Garamond"/>
<fontspec id="1" size="17" family="Garamond"/>
<text top="9" left="278" width="10" height="16" font="0">4</text>
<text top="9" left="220" width="121" height="16" font="1">Marx an Engels </text>
${place}
<text top="9" left="76" width="92" height="16" font="0">Lieber Engels, </text>
</page></pdf2xml>`,
      new Map([[40, "12 4 + Marx an Engels * 7. August 1855"]]),
      {
        volume: 28,
        file: "mew_band28",
        item: "Marx_Engels_Werke_MEW",
        writer: "Marx",
      },
    );
    return [letter?.title, ...(letter?.paragraphs ?? [])];
  };

  it("parts the place from an address set beside it, the address a line before the dateline", () => {
    expect(
      titled(`<text top="9" left="233" width="94" height="16" font="0">in Manchester </text>
<text top="9" left="358" width="139" height="16" font="0">28, Dean Street, Soho </text>
<text top="9" left="351" width="153" height="16" font="0">[London] 7. August 1855 </text>`),
    ).toEqual([
      "An Engels in Manchester. [London] 7. August 1855",
      "28, Dean Street, Soho",
      "[London] 7. August 1855",
      "Lieber Engels,",
    ]);
  });

  it("parts the place from a dateline set beside it", () => {
    expect(
      titled(`<text top="9" left="281" width="69" height="16" font="0">in Brüssel </text>
<text top="9" left="382" width="149" height="16" font="0">[Paris] 19. August 1846 </text>`)[0],
    ).toBe("An Engels in Brüssel. [Paris] 19. August 1846");
  });

  it("parts the place from a dateline in the same run at its bracketed place, not at the place's second word", () => {
    expect(
      titled(
        `<text top="9" left="265" width="270" height="16" font="0">in New York [London] 19. Dezember 1851 </text>`,
      )[0],
    ).toBe("An Engels in New York. [London] 19. Dezember 1851");
  });
});

describe("parseMewLetters, headings set little larger than the text", () => {
  it("opens a letter at a heading under its number though the text layer measured it hardly larger than the text, an än read as an", () => {
    const xml = `<pdf2xml><page number="40">
<fontspec id="0" size="16" family="Garamond"/>
<fontspec id="1" size="17" family="Garamond"/>
<text top="9" left="290" width="10" height="16" font="0">7 </text>
<text top="9" left="203" width="190" height="19" font="1"><b>Marx an Justizrat Weber </b></text>
<text top="9" left="266" width="236" height="16" font="0">in Berlin London, 13ten Februar 1860 </text>
<text top="9" left="60" width="440" height="16" font="0">Sehr geehrter Herr! Ich ersuche Sie, die Sache in die Hand zu nehmen, und so weiter. </text>
<text top="9" left="290" width="10" height="16" font="0">8 </text>
<text top="9" left="203" width="190" height="19" font="1"><b>Marx än Engels </b></text>
<text top="9" left="266" width="236" height="16" font="0">in Manchester [London] 14. Februar 1860 </text>
<text top="9" left="60" width="440" height="16" font="0">Lieber Engels, die Sache mit Weber geht voran, und so weiter, wie es sich gehört. </text>
</page></pdf2xml>`;

    expect(
      parseMewLetters(xml, new Map([[40, "1860 27"]]), {
        volume: 30,
        file: "mew_band30",
        item: "Marx_Engels_Werke_MEW",
        writer: "Marx",
      }).map((letter) => letter.title),
    ).toEqual([
      "An Justizrat Weber in Berlin. London, 13ten Februar 1860",
      "An Engels in Manchester. [London] 14. Februar 1860",
    ]);
  });
});

describe("parseMewLetters, runs left out within a line", () => {
  it("keeps an emphasised word the text layer measured as small as a mark, and a line a dropped mark widened whole", () => {
    const xml = `<pdf2xml><page number="40">
<fontspec id="0" size="14" family="Garamond"/>
<fontspec id="1" size="17" family="Garamond"/>
<fontspec id="2" size="9" family="Garamond"/>
<text top="9" left="290" width="10" height="16" font="0">7 </text>
<text top="9" left="203" width="190" height="19" font="1">Marx an Engels </text>
<text top="9" left="266" width="236" height="16" font="0">in Manchester [London] 7. Sept. 1873 </text>
<text top="9" left="68" width="427" height="14" font="0">Für den Kostecki kann ich absolut nichts tun. 1. bin ich selbst in high </text>
<text top="9" left="50" width="49" height="14" font="0">pressure</text>
<text top="9" left="100" width="40" height="9" font="2">[2045]</text>
<text top="9" left="154" width="342" height="14" font="0">, die daher auch gehörig auf mich schimpfen; 2. Herr </text>
<text top="9" left="51" width="155" height="14" font="0">K[ostecki] ist keineswegs</text>
<text top="9" left="205" width="70" height="10" font="2"><i> durch mich</i></text>
<text top="9" left="275" width="223" height="14" font="0"> versandt worden, umgekehrt. Er </text>
<text top="9" left="490" width="20" height="10" font="2"><i>llsi]</i></text>
<text top="9" left="50" width="444" height="14" font="0">konnte sich in London nicht halten, und so weiter, wie es der Brauch ist. </text>
<text top="9" left="120" width="90" height="10" font="2"><i>OXSÄSTÖV</i></text>
<text top="9" left="50" width="444" height="14" font="0">Hier noch ein Satz, der zum Brief gehört. </text>
<text top="9" left="120" width="190" height="10" font="2"><i>[Mit Bleistift, in Marx' Handschrift]</i></text>
<text top="9" left="400" width="60" height="14" font="0">Dein</text>
<text top="9" left="466" width="30" height="10" font="2"><i>K.M.</i></text>
</page></pdf2xml>`;

    expect(
      parseMewLetters(xml, new Map([[40, "1873 27"]]), {
        volume: 33,
        file: "mew_band33",
        item: "Marx_Engels_Werke_MEW",
        writer: "Marx",
      })[0]?.paragraphs.slice(1),
    ).toEqual([
      "Für den Kostecki kann ich absolut nichts tun. 1. bin ich selbst in high pressure, die daher auch gehörig auf mich schimpfen; 2. Herr K[ostecki] ist keineswegs *durch mich* versandt worden, umgekehrt. Er konnte sich in London nicht halten, und so weiter, wie es der Brauch ist. Hier noch ein Satz, der zum Brief gehört.",
      "Dein *K.M.*",
    ]);
  });
});

describe("parseMewLetters, facsimiles", () => {
  it("leaves out a page the OCR read from a facsimile, its caption with it, the letter going on after it", () => {
    const xml = `<pdf2xml><page number="40">
<fontspec id="0" size="16" family="Garamond"/>
<fontspec id="1" size="19" family="Garamond"/>
<text top="9" left="269" width="10" height="16" font="0">3 </text>
<text top="9" left="215" width="121" height="19" font="1">Marx an Engels </text>
<text top="9" left="228" width="200" height="16" font="0">in Manchester [London] 9. Mai 1864 </text>
<text top="9" left="60" width="440" height="16" font="0">Lieber Engels, ich schreibe Dir heute nur kurz, denn die Sache mit dem </text>
</page>
<page number="41">
<fontspec id="0" size="16" family="Garamond"/>
<text top="9" left="60" width="440" height="16" font="0">B«r» \u00a7 citfä V safcrs Hiesig »#* |ifn$*a fit ruaK it»rUna%. stät Wv ^ ^ 4t«. W ^ J U ^ t T ^ A^ </text>
<text top="9" left="60" width="440" height="16" font="0">V «•/ p w ' •*„•»*»A»«»-«* # / ~ •: . i J flfc tn 0 »«* J* . y *•*»- - -V- ** - •• </text>
<text top="9" left="60" width="300" height="16" font="0">Rückseite von Marx' Reisepaß (1861) </text>
</page>
<page number="42">
<fontspec id="0" size="16" family="Garamond"/>
<text top="9" left="60" width="440" height="16" font="0">Geld geht nicht voran, wie Du weißt, und so weiter, bis zum Schluß. </text>
</page></pdf2xml>`;

    expect(
      parseMewLetters(xml, new Map([[40, "1864 3"]]), {
        volume: 30,
        file: "mew_band30",
        item: "Marx_Engels_Werke_MEW",
        writer: "Marx",
      })[0]?.paragraphs.slice(1),
    ).toEqual([
      "Lieber Engels, ich schreibe Dir heute nur kurz, denn die Sache mit dem Geld geht nicht voran, wie Du weißt, und so weiter, bis zum Schluß.",
    ]);
  });
});

describe("parseMewLetters, a part's title", () => {
  it("closes the letter before the part's title, though the text layer measured it as the text, the notes above it left out", () => {
    const xml = `<pdf2xml><page number="40">
<fontspec id="0" size="16" family="Garamond"/>
<fontspec id="1" size="18" family="Garamond"/>
<fontspec id="2" size="14" family="Garamond"/>
<text top="9" left="290" width="10" height="16" font="0">7 </text>
<text top="9" left="203" width="190" height="19" font="1">Marx an Engels </text>
<text top="9" left="266" width="236" height="16" font="0">in Manchester [London] 7. Sept. 1864 </text>
<text top="9" left="60" width="440" height="16" font="0">Einliegend Photogramm von Laura, und so weiter, wie es sich gehört, bis zum Schluß. </text>
<text top="9" left="400" width="80" height="16" font="0">Dein K.M. </text>
<text top="9" left="60" width="300" height="13" font="2">„Verbesserungen“ - schrecklich, in der Tat! -</text>
<text top="9" left="139" width="287" height="25" font="0"><b>Briefe von Marx und Engels </b></text>
<text top="9" left="180" width="196" height="26" font="0"><b>an dritte Personen </b></text>
</page></pdf2xml>`;

    expect(
      parseMewLetters(xml, new Map([[40, "1864 27"]]), {
        volume: 30,
        file: "mew_band30",
        item: "Marx_Engels_Werke_MEW",
        writer: "Marx",
      })[0]?.paragraphs.slice(1),
    ).toEqual([
      "Einliegend Photogramm von Laura, und so weiter, wie es sich gehört, bis zum Schluß.",
      "Dein K.M.",
    ]);
  });
});

describe("parseMewLetters, a page's margin", () => {
  it("takes the margin from the edge the lines share, not from a line a speck in the margin opens", () => {
    const xml = `<pdf2xml><page number="40">
<fontspec id="0" size="15" family="Garamond"/>
<fontspec id="1" size="18" family="Garamond"/>
<text top="9" left="260" width="18" height="18" font="0">27 </text>
<text top="9" left="197" width="158" height="20" font="1">Marx an Engels </text>
<text top="9" left="229" width="97" height="16" font="0">in Manchester </text>
<text top="9" left="359" width="140" height="18" font="0">[London] 3. März 1852 </text>
<text top="9" left="74" width="426" height="16" font="0">Deine Sendung der „Revolution" und „Tribüne" war erbrochen. Man </text>
<text top="9" left="55" width="419" height="16" font="0">hatte sich nicht einmal die Mühe genommen, sie wieder zuzumachen. </text>
<text top="9" left="11" width="491" height="16" font="0">/ mit einem Antwortschreiben an Frau Daniels verwechselt, wie es </text>
<text top="9" left="55" width="440" height="16" font="0">scheint, und so weiter, und so fort, wie es der Brauch ist. </text>
</page></pdf2xml>`;

    expect(
      parseMewLetters(xml, new Map([[40, "1852 27"]]), {
        volume: 28,
        file: "mew_band28",
        item: "Marx_Engels_Werke_MEW",
        writer: "Marx",
      })[0]?.paragraphs.slice(1),
    ).toEqual([
      "Deine Sendung der „Revolution“ und „Tribüne“ war erbrochen. Man hatte sich nicht einmal die Mühe genommen, sie wieder zuzumachen. / mit einem Antwortschreiben an Frau Daniels verwechselt, wie es scheint, und so weiter, und so fort, wie es der Brauch ist.",
    ]);
  });
});

describe("parseMewLetters, words the text layer measured small", () => {
  it("keeps a word or line of the text it measured as small as a note, between runs of the text; notes, marks, specks, running heads, the editors' sources and the printer's signature stay out", () => {
    const xml = `<pdf2xml><page number="40">
<fontspec id="0" size="16" family="Garamond"/>
<fontspec id="1" size="18" family="Garamond"/>
<fontspec id="2" size="14" family="Garamond"/>
<fontspec id="3" size="8" family="Garamond"/>
<fontspec id="4" size="12" family="Garamond"/>
<text top="9" left="260" width="18" height="18" font="0">27 </text>
<text top="9" left="197" width="158" height="20" font="1">Marx an Adolf Cluß </text>
<text top="9" left="229" width="97" height="16" font="2">in Washington </text>
<text top="9" left="359" width="140" height="18" font="0">[London] 30. Juli 1852 </text>
<text top="9" left="70" width="176" height="18" font="0">Lieber Cluß! Er bekam große Elogen von</text>
<text top="9" left="246" width="40" height="14" font="2"> Seiten</text>
<text top="9" left="286" width="190" height="18" font="0"> des Herrn Delius, gegen Injurie</text>
<text top="9" left="30" width="190" height="14" font="2">W $ n - f c j C&lt;t ^ Uta ^ W U</text>
<text top="9" left="476" width="5" height="12" font="3">1</text>
<text top="9" left="481" width="20" height="18" font="0"> und</text>
<text top="9" left="50" width="190" height="14" font="2">excites „ m i g h t i l y little enthusiasm"</text>
<text top="9" left="50" width="150" height="18" font="0">so weiter, und so fort, wie es in solchen Briefen der Brauch ist, bis zum Ende des Briefes. </text>
<text top="9" left="60" width="120" height="14" font="2">r » ' .immym Mtpim</text>
<text top="9" left="90" width="120" height="18" font="0">Mehr bald. </text>
<text top="9" left="109" width="272" height="14" font="2">28 • Marx an Adolf Cluß • 30. Juli 1852 </text>
<text top="9" left="377" width="105" height="18" font="0">Dein K. M. </text>
<text top="9" left="50" width="200" height="16" font="2">Nach: Photokopie des </text>
<text top="9" left="50" width="100" height="16" font="2">Originals. </text>
<text top="9" left="50" width="3" height="8" font="3">1</text>
<text top="9" left="53" width="69" height="13" font="4"> Beleidigung -</text>
<text top="9" left="60" width="160" height="16" font="2">siehe vorl. Band, S. 606</text>
<text top="9" left="460" width="20" height="18" font="0">29* </text>
</page></pdf2xml>`;

    const [letter] = parseMewLetters(xml, new Map([[40, "1852 27"]]), {
      volume: 28,
      file: "mew_band28",
      item: "Marx_Engels_Werke_MEW",
      writer: "Marx",
    });

    expect([letter?.title, ...(letter?.paragraphs ?? [])]).toEqual([
      "An Adolf Cluß in Washington. [London] 30. Juli 1852",
      "[London] 30. Juli 1852",
      "Lieber Cluß! Er bekam große Elogen von Seiten des Herrn Delius, gegen Injurie und excites „mightily little enthusiasm“ so weiter, und so fort, wie es in solchen Briefen der Brauch ist, bis zum Ende des Briefes.",
      "Mehr bald.",
      "Dein K. M.",
    ]);
  });
});

describe("parseMewLetters, corrections", () => {
  const xml = `<pdf2xml><page number="40">
<fontspec id="0" size="14" family="Garamond"/>
<fontspec id="1" size="17" family="Garamond"/>
<text top="9" left="269" width="17" height="16" font="0">41 </text>
<text top="9" left="217" width="122" height="16" font="1">Marx an Engels </text>
<text top="9" left="216" width="287" height="16" font="0">in Great Yarmouth Hotel du Nord, Lausanne </text>
<text top="9" left="375" width="85" height="16" font="0">R August 82 </text>
<text top="9" left="72" width="71" height="16" font="0">Dear Fred, </text>
</page></pdf2xml>`;
  const read = (corrections: MewLetters["corrections"]): BookUnit[] =>
    parseMewLetters(xml, new Map([[40, "1882 41"]]), {
      volume: 35,
      file: "mew_band35",
      item: "Marx_Engels_Werke_MEW",
      writer: "Marx",
      corrections,
    });

  it("sets right on its printed page what the text layer misread, a line it ran on set apart where the correction breaks it", () => {
    const [letter] = read([
      {
        page: 41,
        from: "in Great Yarmouth Hotel du Nord, Lausanne",
        to: "in Great Yarmouth\nHotel du Nord, Lausanne",
      },
      { page: 41, from: "R August 82", to: "24. August 82" },
    ]);

    expect([letter?.title, ...(letter?.paragraphs ?? [])]).toEqual([
      "An Engels in Great Yarmouth. 24. August 82",
      "Hotel du Nord, Lausanne",
      "24. August 82",
      "Dear Fred,",
    ]);
  });

  it("restores a table the text layer read cell by cell from a correction through its last line, its rows parted by bars", () => {
    const [letter] = parseMewLetters(
      `<pdf2xml><page number="40">
<fontspec id="0" size="14" family="Garamond"/>
<fontspec id="1" size="17" family="Garamond"/>
<text top="9" left="269" width="17" height="16" font="0">41 </text>
<text top="9" left="217" width="122" height="16" font="1">Marx an Engels </text>
<text top="9" left="216" width="200" height="16" font="0">in Manchester [London] 20.Oktober 1857 </text>
<text top="9" left="80" width="400" height="16" font="0">Folgendes ist ein Resumé, wie es die Regierung gibt, und so weiter: </text>
<text top="9" left="63" width="72" height="12" font="0">September 20 </text>
<text top="9" left="192" width="19" height="12" font="0">214 </text>
<text top="9" left="63" width="91" height="12" font="0">October 2 </text>
<text top="9" left="198" width="19" height="12" font="0">300 </text>
<text top="9" left="80" width="400" height="16" font="0">Von den 30 899 Mann sind also die meisten noch unterwegs, wie Du siehst. </text>
</page></pdf2xml>`,
      new Map([[40, "1857 41"]]),
      {
        volume: 29,
        file: "mew_band29",
        item: "Marx_Engels_Werke_MEW",
        writer: "Marx",
        corrections: [
          {
            page: 41,
            from: "September 20",
            through: "300",
            to: "Day of Arrival | Total\nSeptember 20 | 214\nOctober 2 | 300",
          },
        ],
      },
    );

    expect(letter?.paragraphs.slice(1)).toEqual([
      "Folgendes ist ein Resumé, wie es die Regierung gibt, und so weiter:",
      "| Day of Arrival | Total |\n| --- | --- |\n| September 20 | 214 |\n| October 2 | 300 |",
      "Von den 30 899 Mann sind also die meisten noch unterwegs, wie Du siehst.",
    ]);
  });

  it("restores the opening lines the text layer lost, the paragraph going on after them", () => {
    const [letter] = parseMewLetters(
      `<pdf2xml><page number="40">
<fontspec id="0" size="16" family="Garamond"/>
<fontspec id="1" size="19" family="Garamond"/>
<text top="9" left="269" width="10" height="16" font="0">3 </text>
<text top="9" left="215" width="121" height="19" font="1">Marx an Engels </text>
<text top="9" left="228" width="77" height="16" font="0">in Ramsgate</text>
<text top="9" left="54" width="447" height="16" font="0">den ich eigenhändig, präsente Dr. Gans junior, am 18. August auf dem </text>
<text top="9" left="54" width="444" height="16" font="0">hiesigen Hauptpostamt an sie abgab, unterschlagen worden, zweifelsohne. </text>
</page></pdf2xml>`,
      new Map([[40, "10 3 Marx an Engels 8.September 1875"]]),
      {
        volume: 34,
        file: "mew_band34",
        item: "Marx_Engels_Werke_MEW",
        writer: "Marx",
        corrections: [
          {
            page: 10,
            from: "den ich eigenhändig",
            through: "den ich eigenhändig",
            to: "8.Sept. 75\nGermania, Karlsbad\nLieber Fred,\nDu wirst wahrscheinlich schon von Tussy wissen, daß mein erster Brief, den ich eigenhändig, präsente Dr. Gans junior, am 18. August auf dem",
          },
        ],
      },
    );

    expect([letter?.title, ...(letter?.paragraphs ?? [])]).toEqual([
      "An Engels in Ramsgate. 8.Sept. 75",
      "8.Sept. 75",
      "Germania, Karlsbad",
      "Lieber Fred,",
      "Du wirst wahrscheinlich schon von Tussy wissen, daß mein erster Brief, den ich eigenhändig, präsente Dr. Gans junior, am 18. August auf dem hiesigen Hauptpostamt an sie abgab, unterschlagen worden, zweifelsohne.",
    ]);
  });

  it("lets a correction's first line go on with the paragraph it sets right, its caption and rows apart", () => {
    const [letter] = parseMewLetters(
      `<pdf2xml><page number="40">
<fontspec id="0" size="16" family="Garamond"/>
<fontspec id="1" size="19" family="Garamond"/>
<text top="9" left="269" width="10" height="16" font="0">3 </text>
<text top="9" left="215" width="121" height="19" font="1">Marx an Engels </text>
<text top="9" left="228" width="200" height="16" font="0">in Manchester [London] 15. Juli 1858 </text>
<text top="9" left="84" width="435" height="16" font="0">Ich halte es für nötig, daß Du diese Details durchgehst, da es sonst unmöglich ist, </text>
<text top="9" left="66" width="427" height="16" font="0">zu einer richtigen Beurteilung des case </text>
<text top="9" left="66" width="369" height="16" font="0">zu kommen. Berechnung für 20 £ am 19. Mai. Davon bezahlt: </text>
<text top="9" left="65" width="139" height="16" font="0">Steuern (Wasser, Gas) </text>
<text top="9" left="434" width="72" height="16" font="0">£ 7 — </text>
</page></pdf2xml>`,
      new Map([[40, "341 153 Marx an Engels 15.Juli 1858"]]),
      {
        volume: 29,
        file: "mew_band29",
        item: "Marx_Engels_Werke_MEW",
        writer: "Marx",
        corrections: [
          {
            page: 341,
            from: "Berechnung für 20 £ am 19. Mai.",
            through: "£ 7 —",
            to: "zu kommen.\n*Berechnung für 20 £ am 19. Mai.* Davon bezahlt:\nSteuern (Wasser, Gas) | £ 7 —",
          },
        ],
      },
    );

    expect(letter?.paragraphs.slice(1)).toEqual([
      "Ich halte es für nötig, daß Du diese Details durchgehst, da es sonst unmöglich ist, zu einer richtigen Beurteilung des case zu kommen.",
      "*Berechnung für 20 £ am 19. Mai.* Davon bezahlt:",
      "|  |  |\n| --- | --- |\n| Steuern (Wasser, Gas) | £ 7 — |",
    ]);
  });

  it("stops at a correction that finds nothing to set right", () => {
    expect(() =>
      read([{ page: 41, from: "in Lausanne", to: "in Vevey" }]),
    ).toThrow('No "in Lausanne" on page 41 to correct');
  });
});

describe("parseMewLetters, letters the edition translates", () => {
  it("leaves out a letter the editors mark as translated, its German theirs", () => {
    const xml = `<pdf2xml><page number="40">
<fontspec id="0" size="14" family="Garamond"/>
<fontspec id="1" size="17" family="Garamond"/>
<fontspec id="2" size="11" family="Garamond"/>
<text top="9" left="278" width="10" height="16" font="0">4</text>
<text top="9" left="233" width="160" height="16" font="1">Marx an Bertalan Szemere</text>
<text top="9" left="240" width="60" height="16" font="0">in Paris</text>
<text top="9" left="370" width="120" height="16" font="0">London, 12. Jan. 1860</text>
<text top="9" left="60" width="440" height="16" font="0">Ich habe Ihren Brief erhalten und danke Ihnen herzlich für die Nachricht.</text>
<text top="9" left="40" width="440" height="16" font="0">Es geht uns allen gut, und ich hoffe bald wieder von Ihnen zu hören, wie immer.</text>
<text top="9" left="380" width="60" height="16" font="0">K.Marx</text>
<text top="9" left="32" width="115" height="13" font="2">Aus dem Französischen. </text>
<text top="9" left="278" width="10" height="16" font="0">5</text>
<text top="9" left="233" width="120" height="16" font="1">Marx an Engels</text>
<text top="9" left="240" width="90" height="16" font="0">in Manchester</text>
<text top="9" left="370" width="120" height="16" font="0">[London] 13. Jan. 1860</text>
<text top="9" left="60" width="440" height="16" font="0">Ich schreibe Dir heute nur kurz, da ich wenig Zeit habe und morgen mehr.</text>
<text top="9" left="40" width="440" height="16" font="0">Es geht uns allen gut, und die Kinder lassen Dich herzlich grüßen, wie immer.</text>
</page></pdf2xml>`;

    expect(
      parseMewLetters(
        xml,
        new Map([[40, "12 4 + Marx an Szemere * 12. Januar 1860"]]),
        {
          volume: 30,
          file: "mew_band30",
          item: "Marx_Engels_Werke_MEW",
          writer: "Marx",
        },
      ).map((unit) => unit.title),
    ).toEqual(["An Engels in Manchester. [London] 13. Jan. 1860"]);
  });
});

describe("mewPageNumbers", () => {
  it("numbers each PDF page by its head, a head misread taking the number its neighbours agree on", () => {
    const pages = mewPageNumbers(
      new Map([
        [100, "72 40 + Marx an Engels * 1. März 1860"],
        [101, "40 + Marx an Engels * 1. März 1860 73"],
        [102, "74 41 + Marx an Engels * 3. März 1860"],
        [103, "41 + Marx an Engels * 3. März 1860 15"],
        [104, ""],
        [105, "42 + Marx an Engels * 9. März 1860 77"],
        [106, "78 43 + Marx an Engels * 10. März 1860"],
      ]),
    );

    expect([...pages]).toEqual([
      [100, 72],
      [101, 73],
      [102, 74],
      [103, 75],
      [104, 76],
      [105, 77],
      [106, 78],
    ]);
  });
});
