import { describe, expect, it } from "bun:test";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { parseMlwerkePages } from "../src/adapters/mlwerke";

const URL_471 = "http://www.mlwerke.de/me/me40/me40_471.htm";
const URL_533 = "http://www.mlwerke.de/me/me40/me40_533.htm";

async function pages(): Promise<Array<{ url: string; html: string }>> {
  const read = (name: string): Promise<string> =>
    readFile(join(import.meta.dir, "fixtures", name), "utf8");
  return [
    { url: URL_471, html: await read("mlwerke-opm-471.html") },
    { url: URL_533, html: await read("mlwerke-opm-533.html") },
  ];
}

const work = { citation: "Manuskripte 1844" };

describe("parseMlwerkePages", () => {
  it("reads each heading under its part, cited by work and MEW page", async () => {
    const units = parseMlwerkePages(await pages(), work);

    expect(
      units.map((unit) => [unit.parents, unit.title, unit.section]),
    ).toEqual([
      [["Erstes Manuskript"], "Arbeitslohn", "Manuskripte 1844, 471"],
      [
        ["[Drittes Manuskript]"],
        "[Privateigentum und Kommunismus]",
        "Manuskripte 1844, 533",
      ],
    ]);
    expect(units[0]?.source).toBe(URL_471);
  });

  it("reads the text as MEW prints it, the editors' notes and their marks left out", async () => {
    const units = parseMlwerkePages(await pages(), work);

    expect(units[0]?.paragraphs).toEqual([
      "||I| *Arbeitslohn* wird bestimmt durch den feindlichen Kampf. Der Arbeitslohn ist der niedrigste, der mit der simple humanité, nämlich einer viehischen Existenz, verträglich ist.",
      "„Die Nachfrage nach Menschen regelt notwendig die Produktion.“ ⟨Gestrichene Stelle⟩ Weiter im Text.",
      "Das + müßte sterben – so.",
    ]);
  });

  it("keeps Marx's own notes, marked where he set them, without the editors' lead-in", async () => {
    const units = parseMlwerkePages(await pages(), work);

    expect(units[1]?.paragraphs).toEqual([
      "Die Prostitution ist ein Verhältnis. A)",
      "Ich kann mich praktisch nur menschlich zu der Sache verhalten. B)",
      "A) Die Prostitution nur ein *besondrer* Ausdruck der *allgemeinen* Prostitution.",
      "B) Sie ist daher ebenso vielfach.",
    ]);
  });

  it("knows the editors' notes by their heading set as a paragraph, or by their class", () => {
    const page = `<H3>Profit des Kapitals</H3><P CLASS="fst">&lt;483&gt;Der Text.</P><P>Redaktionelle Fu&szlig;noten</P><P CLASS="note"><A HREF="#1*" NAME="n1*">1*.</A> Hervorhebung von Marx</P><P CLASS="note">Ein Wort korrigiert.</P>`;
    const stray = `<H3>Grundrente</H3><P CLASS="fst">&lt;497&gt;Die Rente.</P><P CLASS="note">Eine Anmerkung der Redaktion.</P>`;

    expect(
      parseMlwerkePages([{ url: URL_471, html: page }], work).map(
        (unit) => unit.paragraphs,
      ),
    ).toEqual([["Der Text."]]);
    expect(
      parseMlwerkePages([{ url: URL_471, html: stray }], work).map(
        (unit) => unit.paragraphs,
      ),
    ).toEqual([["Die Rente."]]);
  });

  it("leaves out the marks of the editors' notes the volume gathers on a page of their own", () => {
    const page = `<H3>Feuerbach</H3><P>&lt;20&gt;Vorstellungen <A NAME="Z3"><A HREF="me03_anm.htm#M3">(3)</A></A>. Wie oben (<A HREF="#S31">p. [31-33]</A>).</P>`;

    expect(
      parseMlwerkePages([{ url: URL_471, html: page }], work)[0]?.paragraphs,
    ).toEqual(["Vorstellungen. Wie oben (p. [31-33])."]);
  });

  it("keeps the notes of Karl Marx and leaves out the editors' dating, source and text variants", () => {
    const page = `<H1>Inauguraladresse</H1><FONT SIZE=2><P>Geschrieben zwischen dem 21. und 27. Oktober 1864.</P></FONT><P><HR></P><FONT SIZE=2><P>["Der Social-Demokrat" Nr. 2 und 3 vom 21. und 30. Dezember 1864]<I> </P></I></FONT><B><P><A NAME="S5">|5|</A></B> Heruntergebracht.<A HREF="#F1"><A name="ZF1">(1)</A></A> Des Kapitals <A HREF="#T1"><A name="ZT1">{1}</A></A> stand bevor.</P><P><HR></P><P>Fu&szlig;noten von Karl Marx</P><P><A name="F1">(1)</A> Wir brauchen den Leser. <A HREF="#ZF1">&lt;=</A></P><HR><P>Textvarianten</P><P><A name="T1">{1} </A>Im englischen Text: des Besitzes <A HREF="#ZT1">&lt;=</A></P>`;

    expect(
      parseMlwerkePages([{ url: URL_471, html: page }], {
        citation: "Inauguraladresse",
      }).map((unit) => [unit.title, unit.section, unit.paragraphs]),
    ).toEqual([
      [
        "Inauguraladresse, 5",
        "Inauguraladresse, 5",
        [
          "Heruntergebracht.1) Des Kapitals stand bevor.",
          "1) Wir brauchen den Leser.",
        ],
      ],
    ]);
  });

  it("sets the editors' glosses the older pages bar as MEW's angle brackets, a manuscript's numbers as they stand", () => {
    const page = `<H3>Lohn</H3><P>&lt;5&gt;seine Audienz |Zuh&ouml;rerschaft| durch, |<I>in Wirklichkeit</I>| so.</P><P>|II|Arbeitslohn ist|III| so, ||I| fort.</P>`;

    expect(
      parseMlwerkePages([{ url: URL_471, html: page }], work)[0]?.paragraphs,
    ).toEqual([
      "seine Audienz ⟨Zuhörerschaft⟩ durch, ⟨*in Wirklichkeit*⟩ so.",
      "|II|Arbeitslohn ist|III| so, ||I| fort.",
    ]);
  });

  it("leaves out the site's path to the volume at the page's foot", () => {
    const page = `<H3>Brief</H3><P>&lt;3&gt;Teurer Vater!</P><HR><P><SMALL>Pfad: &raquo;../me/me40&laquo;</SMALL></P>`;

    expect(
      parseMlwerkePages([{ url: URL_471, html: page }], work)[0]?.paragraphs,
    ).toEqual(["Teurer Vater!"]);
  });

  it("opens a quotation the emphasis opens with it", () => {
    const page = `<H3>Grün</H3><P>&lt;480&gt;ihre <I>"Auflösung"</I> und <I>"so</I> weiter" (2).</P>`;

    expect(
      parseMlwerkePages([{ url: URL_471, html: page }], work)[0]?.paragraphs,
    ).toEqual(["ihre *„Auflösung“* und *„so* weiter“ (2)."]);
  });

  it("fixes the transcription's slips on the MEW page the work names", async () => {
    const units = parseMlwerkePages(await pages(), {
      ...work,
      fixes: [
        {
          page: "471",
          from: "||I| *Arbeitslohn*",
          to: "||I| *Der Arbeitslohn*",
        },
        { page: "533", from: "Prostitution ist", to: "Prostitution ist nur" },
      ],
    });

    expect(units[0]?.paragraphs[0]).toStartWith("||I| *Der Arbeitslohn* wird");
    expect(units[1]?.paragraphs[0]).toBe(
      "Die Prostitution ist nur ein Verhältnis. A)",
    );
  });

  it("refuses a fix whose text is not on its page", async () => {
    const pagesRead = await pages();

    expect(() =>
      parseMlwerkePages(pagesRead, {
        ...work,
        fixes: [{ page: "533", from: "||I| *Arbeitslohn*", to: "x" }],
      }),
    ).toThrow(/533/);
  });

  it("reads a page of the older template from its text region, its page numbers set in bars", async () => {
    const html = await readFile(
      join(import.meta.dir, "fixtures", "mlwerke-kh-203.html"),
      "utf8",
    );
    const units = parseMlwerkePages([{ url: URL_471, html }], {
      citation: "Staatsrecht",
    });

    expect(
      units.map((unit) => [unit.parents, unit.title, unit.section]),
    ).toEqual([
      [
        [],
        "[Kritik des Hegelschen Staatsrechts (§§ 261-313)]",
        "Staatsrecht, 203",
      ],
    ]);
    expect(units[0]?.paragraphs).toEqual([
      "§ 261. »Gegen die Sphären des Privatrechts ist der Staat *einerseits* eine *äußerliche* Notwendigkeit.«",
      "Der vorige Paragraph belehrt uns dahin, daß die *konkrete Freiheit* in der Identität besteht.",
      "Anmerkung.",
      "Die Angelegenheit für sich »subjektiv«.",
      "Hegel fährt fort und schließt.",
    ]);
  });

  it("reads a page of the oldest template: headings in large type, Marx's notes after a rule", async () => {
    const html = await readFile(
      join(import.meta.dir, "fixtures", "mlwerke-hv-408.html"),
      "utf8",
    );
    const units = parseMlwerkePages([{ url: URL_471, html }], {
      citation: "Herr Vogt",
    });

    expect(
      units.map((unit) => [unit.parents, unit.title, unit.section]),
    ).toEqual([[[], "III. Polizistisches", "Herr Vogt, 408"]]);
    expect(units[0]?.paragraphs).toEqual([
      "„Welch' Neues Unerhörtes hat der Vogt Sich ausgesonnen!“ (*Schiller*)",
      "„Ich spreche es unverhohlen aus“, spricht Vogt 1), und so weiter.",
      "Heiß mich nicht reden, heiß mich schweigen, Denn das Geheimnis ist mir Pflicht!",
      "Wie oben (p. [31]) gesagt.",
      "1) Erst nach dem Druck der „Enthüllungen“ erfuhr ich es. [*Zusatz von Engels zur Ausgabe von 1885.*]",
    ]);
  });

  it("keeps a paragraph whole whose emphasis the page opened before it", () => {
    const page = `<H3>Das Verh&auml;ltnis</H3><P>&lt;526&gt;Die Bewegung sind:</P> <EM><P>Erstens</EM> &#150; <EM>unmittelbare</EM> Einheit.</P> <B><P>Zweitens</B> so.</P>`;

    expect(
      parseMlwerkePages([{ url: URL_471, html: page }], work)[0]?.paragraphs,
    ).toEqual([
      "Die Bewegung sind:",
      "*Erstens* – *unmittelbare* Einheit.",
      "*Zweitens* so.",
    ]);
  });

  const listed = `<FONT SIZE=5><P ALIGN="CENTER">II<BR>Sankt Bruno</P></FONT><P ALIGN="CENTER">1. "Feldzug" gegen Feuerbach</P><P>&lt;78&gt;Text eins.</P><FONT SIZE=5><P ALIGN="CENTER">}-{ Recht ist, was Mit Recht ist</P></FONT><P ALIGN="CENTER">Sankt Sancho.</P><P>Text zwei.</P><P ALIGN="CENTER">[B. Die Basis] [1.] Verkehr</P><P>Text drei.</P>`;
  const bruno = {
    level: 1,
    title: "II. Sankt Bruno",
    match: ["II", "Sankt Bruno"],
  };
  const feldzug = {
    level: 2,
    title: "1. „Feldzug“ gegen Feuerbach",
    match: ['1. "Feldzug"'],
  };
  const listedHeadings = [
    bruno,
    feldzug,
    { level: 2, title: "[B. Die Basis]" },
    { level: 3, title: "[1.] Verkehr" },
  ];

  it("takes a work's headings from the list it names, every other centred line text", () => {
    const units = parseMlwerkePages([{ url: URL_471, html: listed }], {
      citation: "Ideologie",
      headings: listedHeadings,
    });

    expect(
      units.map((unit) => [
        unit.parents,
        unit.title,
        unit.section,
        unit.paragraphs,
      ]),
    ).toEqual([
      [
        ["II. Sankt Bruno"],
        "1. „Feldzug“ gegen Feuerbach",
        "Ideologie, 78",
        [
          "Text eins.",
          "}-{ Recht ist, was Mit Recht ist",
          "Sankt Sancho.",
          "Text zwei.",
        ],
      ],
      [
        ["II. Sankt Bruno", "[B. Die Basis]"],
        "[1.] Verkehr",
        "Ideologie, 78",
        ["Text drei."],
      ],
    ]);
  });

  it("opens a heading the pages leave out where the next listed heading stands", () => {
    const units = parseMlwerkePages([{ url: URL_471, html: listed }], {
      citation: "Ideologie",
      headings: [
        bruno,
        feldzug,
        { level: 2, title: "[B) Mein Verkehr]", match: [] },
        { level: 3, title: "[B. Die Basis]" },
        { level: 4, title: "[1.] Verkehr" },
      ],
    });

    expect(units.map((unit) => [unit.parents, unit.title])).toEqual([
      [["II. Sankt Bruno"], "1. „Feldzug“ gegen Feuerbach"],
      [
        ["II. Sankt Bruno", "[B) Mein Verkehr]", "[B. Die Basis]"],
        "[1.] Verkehr",
      ],
    ]);
  });

  it("refuses a listed heading the pages do not have", () => {
    expect(() =>
      parseMlwerkePages([{ url: URL_471, html: listed }], {
        citation: "Ideologie",
        headings: [
          ...listedHeadings,
          { level: 2, title: "4. Nachruf an „M. Heß“" },
        ],
      }),
    ).toThrow(/Nachruf/);
  });

  it("leaves out a page with no heading of its own text, such as the editors' introduction", () => {
    const introduction = `<H2>Karl Marx</H2><H1>Manuskripte</H1><P CLASS="info">Zu diesen Texten schreibt das Institut.</P><P CLASS="toc"><A HREF="me40_467.htm">Vorrede</A></P>`;

    expect(
      parseMlwerkePages([{ url: URL_471, html: introduction }], work),
    ).toEqual([]);
  });
});

describe("parseMlwerkePages, a volume's articles", () => {
  const article = (
    author: string,
    title: string,
    page: number,
    text: string,
  ): string =>
    `<FONT SIZE=2><P>Seitenzahlen verweisen auf: Karl Marx/Friedrich Engels - Werke, Band 15. S. ${page}-${page + 2}.</P></FONT><H2>${author} </H2><H1>${title} </H1><P>Geschrieben im Oktober 1861.</P><P>["Die Presse" Nr. 293 vom 25. Oktober 1861]</P><B><P><A NAME="S${page}">&lt;${page}&gt;</A></B> ${text}</P>`;

  it("titles each page's article by its own heading, its authors' line left out", () => {
    const units = parseMlwerkePages(
      [
        {
          url: "http://www.mlwerke.de/me/me15/me15_329.htm",
          html: article(
            "Karl Marx",
            "Der nordamerikanische B&uuml;rgerkrieg",
            329,
            "Seit Monaten sind die Londoner Blätter erregt.",
          ),
        },
        {
          url: "http://www.mlwerke.de/me/me15/me15_486.htm",
          html: article(
            "Karl Marx/Friedrich Engels",
            "Der Amerikanische B&uuml;rgerkrieg",
            486,
            "Von welchem Gesichtspunkt immer betrachtet.",
          ),
        },
      ],
      { citation: "Presse", articles: true },
    );

    expect(
      units.map((unit) => [
        unit.parents,
        unit.title,
        unit.section,
        unit.paragraphs,
      ]),
    ).toEqual([
      [
        [],
        "Der nordamerikanische Bürgerkrieg",
        "Presse, 329",
        ["Seit Monaten sind die Londoner Blätter erregt."],
      ],
      [
        [],
        "Der Amerikanische Bürgerkrieg",
        "Presse, 486",
        ["Von welchem Gesichtspunkt immer betrachtet."],
      ],
    ]);
  });
});

describe("parseMlwerkePages, an article whose page sets its title with its authors' line", () => {
  it("titles the article by the line under the authors' name, the line left out of the text", () => {
    const html = `<FONT SIZE=2><P>Seitenzahlen verweisen auf: Karl Marx/Friedrich Engels - Werke, Band 16. S. 21.</P></FONT><B><FONT SIZE=5><P>Karl Marx <BR></FONT><FONT SIZE=6>[Brief an den Redakteur des "Beobachters"] </P></B></FONT><P><HR></P><FONT SIZE=2><P>["Der Beobachter" Nr. 282 vom 3. Dezember 1864] </P></FONT><B><P><A NAME="S21">|21|</A></B> Herr Redakteur! Ich ersuche Sie.</P>`;
    const units = parseMlwerkePages(
      [{ url: "http://www.mlwerke.de/me/me16/me16_021.htm", html }],
      { citation: "Artikel", articles: true },
    );

    expect(
      units.map((unit) => [unit.title, unit.section, unit.paragraphs]),
    ).toEqual([
      [
        "[Brief an den Redakteur des „Beobachters“]",
        "Artikel, 21",
        ["Herr Redakteur! Ich ersuche Sie."],
      ],
    ]);
  });
});

describe("parseMlwerkePages, an article whose page leaves its heading open", () => {
  it("closes the heading where its line ends, the text after it kept", () => {
    const html = `<small>Seitenzahlen verweisen auf: Karl Marx - Friedrich Engels - Werke, Band 5, S. 453-454</small><h1>Die neuesten Nachrichten aus Wien</font></p><p><font size="2">["Neue Rheinische Zeitung" Nr. 135 vom 5. November 1848]</font></p><p><b><a name="S453">&lt;453&gt;</a></b> Köln, 4. November. Der Horizont lichtet sich.</p>`;
    const units = parseMlwerkePages(
      [{ url: "http://www.mlwerke.de/me/me05/me05_453.htm", html }],
      { citation: "NRZ", articles: true },
    );

    expect(
      units.map((unit) => [unit.title, unit.section, unit.paragraphs]),
    ).toEqual([
      [
        "Die neuesten Nachrichten aus Wien",
        "NRZ, 453",
        ["Köln, 4. November. Der Horizont lichtet sich."],
      ],
    ]);
  });
});

describe("parseMlwerkePages, an article whose page sets its title in large type", () => {
  it("titles each article by its first large line, centred or not, the line left out of the text", () => {
    const page = (title: string, align: string, label: string): string =>
      `<SMALL>Seitenzahlen verweisen auf: Karl Marx - Friedrich Engels - Werke, Band 6, S. ${label}</SMALL></P><FONT SIZE=5><P${align}>${title}</P></FONT><FONT SIZE=2><P>["Neue Rheinische Zeitung" Nr. 239 vom 7. März 1849]</P></FONT><B><P>&lt;${label}&gt;</B> Köln, 6. März. Text ${label}.</P>`;
    const units = parseMlwerkePages(
      [
        {
          url: "http://www.mlwerke.de/me/me06/me06_326.htm",
          html: page("Die Handelslage", ' ALIGN="CENTER"', "326"),
        },
        {
          url: "http://www.mlwerke.de/me/me06/me06_332.htm",
          html: page("Der Eid der englischen Soldaten", "", "332"),
        },
      ],
      { citation: "NRZ", articles: true },
    );

    expect(
      units.map((unit) => [unit.title, unit.section, unit.paragraphs]),
    ).toEqual([
      ["Die Handelslage", "NRZ, 326", ["Köln, 6. März. Text 326."]],
      [
        "Der Eid der englischen Soldaten",
        "NRZ, 332",
        ["Köln, 6. März. Text 332."],
      ],
    ]);
  });
});

describe("parseMlwerkePages, an article the editors sign for its author", () => {
  it("leaves the editors' line naming the author out of the text", () => {
    const html = `<h1>Revolution in Wien</h1><p><b><a name="S417">&lt;417&gt;</a></b> Köln, 11. Oktober. Text.</p><p><font size="2">Geschrieben von Karl Marx.</font></p>`;
    const units = parseMlwerkePages(
      [{ url: "http://www.mlwerke.de/me/me05/me05_417.htm", html }],
      { citation: "NRZ", articles: true },
    );

    expect(units.map((unit) => unit.paragraphs)).toEqual([
      ["Köln, 11. Oktober. Text."],
    ]);
  });
});

describe("parseMlwerkePages, an article in parts the editors title in brackets", () => {
  const html = `<FONT SIZE=5><P>Der erste Preßprozeß</P></FONT><FONT SIZE=2><P>["Neue Rheinische Zeitung" Nr. 221 vom 14. Februar 1849]</P></FONT><P ALIGN="CENTER">[<I>Verteidigungsrede von Karl Marx</I>]</P><P><B><A NAME="S223">&lt;223&gt;</A></B> Meine Herren Geschwornen!</P><P ALIGN="CENTER">[<I>Verteidigungsrede von Friedrich Engels</I>]</P><P><B><A NAME="S234">&lt;234&gt;</A></B> Meine Herren! Der vorige Redner.</P>`;
  const page = { url: "http://www.mlwerke.de/me/me06/me06_223.htm", html };

  it("heads each part by its bracketed line under the article's title", () => {
    const units = parseMlwerkePages([page], {
      citation: "NRZ",
      articles: true,
    });

    expect(
      units.map((unit) => [unit.parents, unit.title, unit.paragraphs]),
    ).toEqual([
      [
        ["Der erste Preßprozeß"],
        "[Verteidigungsrede von Karl Marx]",
        ["Meine Herren Geschwornen!"],
      ],
      [
        ["Der erste Preßprozeß"],
        "[Verteidigungsrede von Friedrich Engels]",
        ["Meine Herren! Der vorige Redner."],
      ],
    ]);
  });

  it("leaves out a part by its heading", () => {
    const units = parseMlwerkePages([page], {
      citation: "NRZ",
      articles: true,
      skipHeadings: ["[Verteidigungsrede von Friedrich Engels]"],
    });

    expect(units.map((unit) => [unit.title, unit.section])).toEqual([
      ["[Verteidigungsrede von Karl Marx]", "NRZ, 223"],
    ]);
  });

  it("refuses a heading to leave out that the pages do not have", () => {
    expect(() =>
      parseMlwerkePages([page], {
        citation: "NRZ",
        articles: true,
        skipHeadings: ["[Verteidigungsrede von Heinrich Bürgers]"],
      }),
    ).toThrow('No heading "[Verteidigungsrede von Heinrich Bürgers]"');
  });
});

describe("parseMlwerkePages, an article from a newspaper's supplement", () => {
  it("leaves out the editors' bracketed source line, the supplement named after the year", () => {
    const html = `<h1>[Nachrichten aus Paris]</h1><p><font size="2">["Neue Rheinische Zeitung" Nr. 25 vom 25. Juni 1848, Extrabeilage]</font></p><p><b><a name="S110">&lt;110&gt;</a></b> Köln, 24. Juni. Text.</p>`;
    const units = parseMlwerkePages(
      [{ url: "http://www.mlwerke.de/me/me05/me05_110.htm", html }],
      { citation: "NRZ", articles: true },
    );

    expect(units.map((unit) => unit.paragraphs)).toEqual([
      ["Köln, 24. Juni. Text."],
    ]);
  });
});

describe("parseMlwerkePages, the editors' cross-references", () => {
  it("leaves out a gloss that refers the reader to MEW, keeping one that translates", () => {
    const html = `<h1>Lassalle</h1><p><b><a name="S267">&lt;267&gt;</a></b> Wir versprachen gestern &lt;Siehe "Der Steuerverweigerungsprozeß", S. 259&gt;, auf Lassalle zurückzukommen. Nous verrons. &lt;Wir werden sehen.&gt;</p>`;
    const units = parseMlwerkePages(
      [{ url: "http://www.mlwerke.de/me/me06/me06_267.htm", html }],
      { citation: "NRZ", articles: true },
    );

    expect(units.map((unit) => unit.paragraphs)).toEqual([
      [
        "Wir versprachen gestern, auf Lassalle zurückzukommen. Nous verrons. ⟨Wir werden sehen.⟩",
      ],
    ]);
  });
});
