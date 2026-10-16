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

  it("leaves out a paragraph a fix empties, such as a newspaper editor's note", () => {
    const page = `<H3>Brief</H3><P>&lt;687&gt;Ihr ganz ergebener</P><P>Dr. K. Marx</P><P>Redakteur der ehemaligen "Rheinischen Zeitung" (Fu&szlig;note der Redaktion)</P>`;

    expect(
      parseMlwerkePages([{ url: URL_471, html: page }], {
        ...work,
        fixes: [
          {
            page: "687",
            from: "Redakteur der ehemaligen „Rheinischen Zeitung“ (Fußnote der Redaktion)",
            to: "",
          },
        ],
      })[0]?.paragraphs,
    ).toEqual(["Ihr ganz ergebener", "Dr. K. Marx"]);
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

describe("parseMlwerkePages, the pages of shorter writings", () => {
  const read = (
    html: string,
  ): Array<[string[], string, string | null, string[]]> =>
    parseMlwerkePages([{ url: URL_471, html }], {
      citation: "Artikel",
      articles: true,
    }).map((unit) => [unit.parents, unit.title, unit.section, unit.paragraphs]);

  it("titles an article of the older template by the heading above its text region", () => {
    const html = `<P><SMALL>Seitenzahlen verweisen auf: Karl Marx/ Friedrich Engels - Werke. Band <!-- #BeginEditable "Band" -->1<!-- #EndEditable -->. S. <!-- #BeginEditable "Seitenzahl" -->148-151<!-- #EndEditable -->.</SMALL></P><H2><!-- #BeginEditable "Autor" -->Karl Marx<!-- #EndEditable --></H2><H1><!-- #BeginEditable "%DCberschrift" -->Der Ehescheidungsgesetzentwurf<!-- #EndEditable --></H1><!-- #BeginEditable "Textk%F6rper" --><P><SMALL>[&raquo;Rheinische Zeitung&laquo; Nr. 353 vom 19. Dezember 1842]</SMALL></P><P><B>|148|</B> Die Ehe.</P><!-- #EndEditable -->`;

    expect(read(html)).toEqual([
      [[], "Der Ehescheidungsgesetzentwurf", "Artikel, 148", ["Die Ehe."]],
    ]);
  });

  it("cites an article whose page sets no page number from the page its header names", () => {
    const html = `<P><SMALL>Seitenzahlen verweisen auf: Karl Marx - Friedrich Engels - Werke, Band 2, S. 625<BR>Dietz Verlag, Berlin/DDR 1972</SMALL></P><H2>Karl Marx</H2><H1>Erkl&auml;rung</H1><P><SMALL>Aus: "Trier'sche Zeitung" Nr. 26 vom 26. Januar 1846.</SMALL></P><P>Ich habe nie eine Zeile geschrieben.</P><P ALIGN="RIGHT">Karl Marx</P>`;

    expect(read(html)).toEqual([
      [
        [],
        "Erklärung",
        "Artikel, 625",
        ["Ich habe nie eine Zeile geschrieben.", "Karl Marx"],
      ],
    ]);
  });

  it("leaves out the editors' lines above the text, the text's own opening kept", () => {
    const html = `<P><SMALL>Seitenzahlen verweisen auf: Karl Marx - Friedrich Engels - Werke, Band 7, S. 323</SMALL></P><P><FONT SIZE="2">Karl Marx/Friedrich Engels - Werke. (Karl) Dietz Verlag, Berlin. Band 7, S. 323.</FONT></P><H2>Karl Marx; Friedrich Engels</H2><H1>Erkl&auml;rung</H1><P>[Karl Marx]</P><FONT SIZE=2><P>Geschrieben am 11. Mai 1846.<BR>Als lithographisches Zirkular im Mai 1846 verbreitet.</P><P>Erschienen als Brosch&uuml;re Januar 1854 in New York.</P><P>Nach der Handschrift.</P><P>Nach: "Das kommunistische Manifest", <BR>neue Ausgabe, Leipzig 1872.</P><P>["Die Reform" Nr. 139 vom 19. November 1859, Beilage]</P><P>"Neue Rheinische Zeitung. Politisch-&ouml;konomische Revue", Viertes Heft, April 1850.</P><P>"Neue Rheinische Zeitung.</P><P>Politisch-&ouml;konomische Revue",<BR>Zweites Heft, Februar 1850.</P></FONT><P><I>An den Redakteur der "Neuen Deutschen Zeitung"!</I></P><B><P>&lt;323&gt;</B> Nach der Erkl&auml;rung.</P><P>Geschrieben steht es.</P>`;

    expect(read(html)).toEqual([
      [
        [],
        "Erklärung",
        "Artikel, 323",
        [
          "*An den Redakteur der „Neuen Deutschen Zeitung“!*",
          "Nach der Erklärung.",
          "Geschrieben steht es.",
        ],
      ],
    ]);
  });

  it("leaves out an authors' line set in brackets as a heading", () => {
    const html = `<H2>[Karl Marx]</H2><H1>Der Text</H1><P>&lt;511&gt; Der Anfang.</P>`;

    expect(read(html)).toEqual([
      [[], "Der Text", "Artikel, 511", ["Der Anfang."]],
    ]);
  });

  it("sets the articles a page bundles side by side under its title", () => {
    const html = `<H1>Das Verbot</H1><H3>Erster Artikel</H3><P><B>|152|</B> Eins.</P><H3>Zweiter Artikel</H3><P>Zwei.</P><H3>Dritter Artikel</H3><P>Drei.</P>`;

    expect(read(html).map(([parents, title]) => [parents, title])).toEqual([
      [["Das Verbot"], "Erster Artikel"],
      [["Das Verbot"], "Zweiter Artikel"],
      [["Das Verbot"], "Dritter Artikel"],
    ]);
  });

  it("titles an article whose page has no first-level heading by the heading above its text", () => {
    const large = `<P><SMALL>Seitenzahlen verweisen auf: Werke, Band 6, S. 527-528</SMALL></P><P><FONT SIZE=4><Karl Marx</FONT></P><FONT SIZE=5><P>Der 13. Juni</P></FONT><FONT SIZE=2><P>["Der Volksfreund" Nr. 26 vom 29. Juni 1849]</P></FONT><B><P><A NAME="S527">&lt;527&gt;</A></B> <I>Paris, </I>den 21 Juni.</P>`;
    const centred = `<FONT Size="+2"><P ALIGN="CENTER"><A NAME="S18">Nachwort zur zweiten Auflage</P></FONT><P><B>&lt;18&gt;</A></B> Den Lesern.</P>`;
    const unclosed = `<p><font size="+1">Karl Marx/Friedrich Engels</font></p><h1>Forderungen der Kommunistischen Partei</font></p><p><font size="2">Geschrieben zwischen dem 21. und 29. M&auml;rz 1848.</font></p><p><b><a name="S3">&lt;3&gt;</a></b> 1. Ganz Deutschland.</p>`;

    expect(read(large)).toEqual([
      [[], "Der 13. Juni", "Artikel, 527", ["*Paris,* den 21 Juni."]],
    ]);
    expect(read(centred)).toEqual([
      [[], "Nachwort zur zweiten Auflage", "Artikel, 18", ["Den Lesern."]],
    ]);
    expect(read(unclosed)).toEqual([
      [
        [],
        "Forderungen der Kommunistischen Partei",
        "Artikel, 3",
        ["1. Ganz Deutschland."],
      ],
    ]);
  });

  it("leaves out the sections the work names, with their notes, the text after them kept", () => {
    const html = `<H3>I. Gegenstand</H3><P><B>|136|</B> Engels.<A HREF="#F1">(1)</A></P><H4>(Schlu&szlig;)</H4><P>Noch Engels.</P><H3>X. Aus der Geschichte</H3><P><B>|210|</B> Marx.<A HREF="#F2">(2)</A></P><P>Fu&szlig;noten von Friedrich Engels</P><P><A NAME="F1">(1)</A> Eine Note.</P><P><A NAME="F2">(2)</A> Noch eine.</P>`;
    const units = parseMlwerkePages([{ url: URL_471, html }], {
      citation: "Anti-Dühring",
      headings: [
        { level: 1, title: "I. Gegenstand" },
        { level: 1, title: "X. Aus der Geschichte" },
      ],
      skipHeadings: ["I. Gegenstand"],
    });

    expect(
      units.map((unit) => [unit.title, unit.section, unit.paragraphs]),
    ).toEqual([
      [
        "X. Aus der Geschichte",
        "Anti-Dühring, 210",
        ["Marx.2)", "2) Noch eine."],
      ],
    ]);
  });
});

describe("parseMlwerkePages, the site's and the transcription's slips", () => {
  it("leaves out the site's line naming the author and the work above a page's text", () => {
    const html = `<H2>Friedrich Engels - Herrn Eugen D&uuml;hring's Umw&auml;lzung der Wissenschaft</H2><H3>X. Aus der Geschichte</H3><P><B>|210|</B> Marx.</P>`;

    expect(
      parseMlwerkePages([{ url: URL_471, html }], {
        citation: "Anti-Dühring",
        headings: [{ level: 1, title: "X. Aus der Geschichte" }],
      }).map((unit) => [unit.title, unit.paragraphs]),
    ).toEqual([["X. Aus der Geschichte", ["Marx."]]]);
  });

  it("runs a paragraph the transcription broke off at a page number inside a word on into the next", () => {
    const html = `<H3>Revue</H3><P>&lt;219&gt; reißt die Barbarenv&ouml;lker in den Welt- <B>&lt;221&gt;</B></P><P>handel, in die Zivilisation.</P><P>Kauf- <B>&lt;222&gt;</B></P><P>und Verkauf.</P><P>Ein Wort-</P><P>spiel.</P>`;

    expect(
      parseMlwerkePages([{ url: URL_471, html }], work).map(
        (unit) => unit.paragraphs,
      ),
    ).toEqual([
      [
        "reißt die Barbarenvölker in den Welthandel, in die Zivilisation.",
        "Kauf- und Verkauf.",
        "Ein Wort-",
        "spiel.",
      ],
    ]);
  });
});
