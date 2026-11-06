import { describe, expect, it } from "bun:test";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { parseMegaEtx } from "../src/adapters/mega-etx";

async function volume(name: string): Promise<string> {
  return readFile(join(import.meta.dir, "fixtures", name), "utf8");
}

async function grundrisse(): Promise<ReturnType<typeof parseMegaEtx>> {
  return parseMegaEtx(
    [
      {
        file: "MEGA_A2_B001-01_ETX.xml",
        xml: await volume("mega-etx-1.xml"),
        text: "Grundrisse der Kritik der politischen Ökonomie Erster Teil",
      },
      {
        file: "MEGA_A2_B001-02_ETX.xml",
        xml: await volume("mega-etx-2.xml"),
        text: "Grundrisse der Kritik der politischen Ökonomie Zweiter Teil",
      },
    ],
    { citation: "MEGA² II/1", title: "Grundrisse" },
  );
}

describe("parseMegaEtx", () => {
  it("reads one work of a volume, going on into the next volume, cited by MEGA page", async () => {
    const units = await grundrisse();

    expect(
      units.map((unit) => [
        unit.parents,
        unit.title,
        unit.section,
        unit.source,
      ]),
    ).toEqual([
      [
        ["Alfred Darimon: De la Réforme des Banques. Paris 1856."],
        "I.",
        "MEGA² II/1, 49",
        "https://telota.bbaw.de/mega/docs/MEGA_A2_B001-01_ETX.xml",
      ],
    ]);
  });

  it("reads the text as Marx wrote it, the editors' page markers left out", async () => {
    const units = await grundrisse();

    expect(units[0]?.paragraphs).toEqual([
      "Der Werth der Waare ist *bestimmt* durch die Arbeitszeit[,] die im 17t Jahrhundert gilt: 1/39 des Einkommens.\\*",
      "Das Capital ist also nicht einfache Arbeit.",
      "\\* Wie im *Geld* der Tauschwerth.",
    ]);
  });

  it("titles text standing before the first heading by the work, and reads a table's rows", () => {
    const units = parseMegaEtx(
      [
        {
          file: "MEGA_A2_B001-01_ETX.xml",
          xml: `<TEI xmlns="http://www.tei-c.org/ns/1.0"><text><group><text><front><pb n="17"/><div type="editorialHead"><p>Einleitung</p></div></front><body><div1 type="front"><p><lb n="1"/>Inhalt</p><table><row><cell/><cell>1)</cell><cell>Die Production im Allgemeinen.</cell></row></table></div1><div1 type="body"><head type="h1"><lb n="2"/>1) Production.</head><p><lb n="3"/>Der Gegenstand ist zunächst materielle Production.</p></div1></body></text></group></text></TEI>`,
          text: "Einleitung",
        },
      ],
      { citation: "MEGA² II/1", title: "Einleitung zu den Grundrissen" },
    );

    expect(units.map((unit) => unit.title)).toEqual([
      "Einleitung zu den Grundrissen",
      "1) Production.",
    ]);
    // A table row reads its filled cells only.
    expect(units[0]?.paragraphs).toEqual([
      "Inhalt",
      "1) | Die Production im Allgemeinen.",
    ]);
  });

  it("leaves out the other works of the volume", async () => {
    const text = (await grundrisse())
      .flatMap((unit) => unit.paragraphs)
      .join("\n");

    expect(text).not.toContain("Ricardo");
    expect(text).not.toContain("I-1");
  });
});
