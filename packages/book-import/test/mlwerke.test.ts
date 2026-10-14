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

  it("leaves out a page with no heading of its own text, such as the editors' introduction", () => {
    const introduction = `<H2>Karl Marx</H2><H1>Manuskripte</H1><P CLASS="info">Zu diesen Texten schreibt das Institut.</P><P CLASS="toc"><A HREF="me40_467.htm">Vorrede</A></P>`;

    expect(
      parseMlwerkePages([{ url: URL_471, html: introduction }], work),
    ).toEqual([]);
  });
});
