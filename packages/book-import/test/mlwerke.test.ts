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
