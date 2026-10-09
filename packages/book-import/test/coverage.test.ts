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
  - volume: I
    pages: 39–56
    title: Quelques considérations pour une étude comparative des paralysies motrices organiques et hystériques
    year: 1893
    reason: written in French
  - title: Briefe
    reason: not in the Gesammelte Werke
books:
  - item: freud-1952-gw-1
    volume: I
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
    volume: XVII
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
