import { describe, expect, it } from "bun:test";
import { renderCoverage } from "../src/coverage";
import { parseManifest } from "../src/import-books";

const parsed = parseManifest(`
source: archive-ocr
coverage:
  author: Sigmund Freud
  edition: the Gesammelte Werke (Imago, London 1940–52)
  license: The author's text is in the public domain.
gaps:
  - citation: GW I
    pages: 39–56
    title: Quelques considérations pour une étude comparative des paralysies motrices organiques et hystériques
    year: 1893
    reason: written in French
  - title: Briefe
    reason: not in the Gesammelte Werke
books:
  - item: freud-1952-gw-1
    citation: GW I
    firstPage: 21
    lastPage: 38
    slug: charcot
    title: Charcot
    edition: Gesammelte Werke, Bd. I (Imago, London 1952)
    author: Sigmund Freud
    year: 1893
    kind: work
  - item: freud-1941-gw-17
    citation: GW XVII
    firstPage: 63
    lastPage: 138
    slug: abriss-der-psychoanalyse
    title: Abriß der Psychoanalyse
    edition: Gesammelte Werke, Bd. XVII (Imago, London 1941)
    author: Sigmund Freud
    year: 1938
    kind: work
    published: false
`);

if (parsed.source !== "archive-ocr") throw new Error("archive-ocr manifest");
const manifest = parsed;

describe("renderCoverage", () => {
  it("lists every work by volume, imported or a gap with its reason", () => {
    expect(renderCoverage(manifest)).toBe(
      [
        "---",
        "title: Coverage",
        "---",
        "Every work of Sigmund Freud's oeuvre, and whether this brain holds it. Texts come from the Gesammelte Werke (Imago, London 1940–52). The author's text is in the public domain.",
        "",
        "## GW I",
        "",
        "- Charcot (1893, GW I, 21–38) — imported",
        "- Quelques considérations pour une étude comparative des paralysies motrices organiques et hystériques (1893, GW I, 39–56) — gap: written in French",
        "",
        "## GW XVII",
        "",
        "- Abriß der Psychoanalyse (1938, GW XVII, 63–138) — imported, published after the author's death",
        "",
        "## Not in the edition",
        "",
        "- Briefe — gap: not in the Gesammelte Werke",
        "",
      ].join("\n"),
    );
  });
});

describe("renderCoverage across sources", () => {
  const mixed = parseManifest(`
source: dta-tei
coverage:
  author: Karl Marx
  edition: first editions, transcribed or read from their scans
  license: The author's text is in the public domain.
gaps:
  - title: Herr Vogt
    year: 1860
    reason: no scan reads well enough
  - title: Die deutsche Ideologie
    reason: no edition in the public domain
books:
  - id: marx_manifestws_1848
    citation: Manifest
    slug: manifest-der-kommunistischen-partei
    title: Manifest der Kommunistischen Partei
    edition: Manifest der Kommunistischen Partei (London, 1848)
    author: Karl Marx und Friedrich Engels
    year: 1848
    kind: work
  - source: archive-ocr
    item: zur-kritik-der-politischen-okonomie
    citation: Kritik
    firstPage: III
    lastPage: 170
    slug: zur-kritik-der-politischen-oekonomie
    title: Zur Kritik der politischen Oekonomie
    edition: Zur Kritik der politischen Oekonomie (Berlin, 1859)
    author: Karl Marx
    year: 1859
    kind: work
  - source: archive-ocr
    item: theorienberden01marxuoft
    citation: Theorien I
    firstPage: 1
    lastPage: 428
    slug: theorien-ueber-den-mehrwert-1
    title: Theorien über den Mehrwert I
    edition: Theorien über den Mehrwert, Bd. I (Stuttgart, 1905)
    author: Karl Marx
    year: 1905
    kind: work
    published: false
`);

  it("lists every work by decade with the edition it comes from, imported or a gap with its reason", () => {
    expect(renderCoverage(mixed)).toBe(
      [
        "---",
        "title: Coverage",
        "---",
        "The works of Karl Marx this brain holds, and those it lacks with the reason. Texts come from first editions, transcribed or read from their scans. The author's text is in the public domain.",
        "",
        "## 1840s",
        "",
        "- Manifest der Kommunistischen Partei (1848) — imported from Manifest der Kommunistischen Partei (London, 1848)",
        "",
        "## 1850s",
        "",
        "- Zur Kritik der politischen Oekonomie (1859) — imported from Zur Kritik der politischen Oekonomie (Berlin, 1859)",
        "",
        "## 1860s",
        "",
        "- Herr Vogt (1860) — gap: no scan reads well enough",
        "",
        "## 1900s",
        "",
        "- Theorien über den Mehrwert I (1905) — imported from Theorien über den Mehrwert, Bd. I (Stuttgart, 1905), published after the author's death",
        "",
        "## Not held",
        "",
        "- Die deutsche Ideologie — gap: no edition in the public domain",
        "",
      ].join("\n"),
    );
  });
});
