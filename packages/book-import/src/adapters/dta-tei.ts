import { Window } from "happy-dom";
import type { BookUnit } from "../render-book";
import { unitsOfSections } from "../sections";
import { nameOf } from "./markup";
import { newTeiReading, readTei, turnPage, type TeiDialect } from "./tei";

/** A work in the Deutsches Textarchiv. */
export interface DtaTeiWork {
  /** The text's id, e.g. marx_kapital01_1867. */
  id: string;
  /** How a citation names the work before its page: Kapital I. */
  citation: string;
  /** The work's title, which the body's first heading may repeat. */
  title: string;
  /** Headings of divisions left out with all they hold, e.g. an editor's preface. */
  skipHeadings?: string[];
}

export interface DtaTeiText {
  units: BookUnit[];
  /** The transcription's licence, as its header links it. */
  licence: string | null;
}

const VIEW = "https://www.deutschestextarchiv.de/book/view/";
/** Elements that are the page's apparatus, not the author's text. */
const SKIPPED = new Set(["fw", "figure", "milestone", "gap", "titlePage"]);

/** A TeX formula written out: a fraction as a/b, other markup dropped. */
function texText(tex: string): string {
  return tex
    .replace(
      /\\frac\{([^{}]*)\}\{([^{}]*)\}/g,
      (_, top: string, bottom: string) => {
        const part = (text: string): string =>
          /\s/.test(text.trim()) ? `(${text.trim()})` : text.trim();
        return `${part(top)}/${part(bottom)}`;
      },
    )
    .replace(/\\[a-zA-Z]+/g, "")
    .replace(/[{}]/g, "");
}

/** The Textarchiv's TEI: Fraktur letters, TeX formulas, every highlight emphasis. */
const DTA: TeiDialect = {
  isSkipped: (element) => SKIPPED.has(nameOf(element)),
  isDivision: (element) => nameOf(element) === "div",
  formulaText: (formula) => texText(formula.textContent),
  isEmphasis: () => true,
  letters: (text) => text.replace(/ſ/g, "s").replace(/ꝛc\./g, "etc."),
  turnsPage: () => true,
};

/**
 * Read a Deutsches Textarchiv TEI text: the body's divisions as sections
 * under their headings after the front matter's, paragraphs as printed with
 * words broken over a line joined, spaced or italic emphasis marked, the
 * author's notes after the text, each part cited by work and printed page.
 * The title page, back matter, running heads and signatures are left out.
 */
export function parseDtaTei(xml: string, work: DtaTeiWork): DtaTeiText {
  const window = new Window();
  try {
    // The header may hold character data the parser rejects; none is text.
    const document = new window.DOMParser().parseFromString(
      xml.replace(/<!\[CDATA\[[\s\S]*?\]\]>/g, ""),
      "application/xml",
    );
    const front = document.getElementsByTagName("front")[0];
    const body = document.getElementsByTagName("body")[0];
    const licence =
      document.getElementsByTagName("licence")[0]?.getAttribute("target") ??
      null;
    if (!body) return { units: [], licence };
    // The page the text opens on is the last break before it.
    const start = front ?? body;
    const breaks = Array.from(document.getElementsByTagName("pb"));
    const opening = breaks
      .filter((pb) => (pb.compareDocumentPosition(start) & 4) === 4)
      .at(-1);
    const reading = newTeiReading();
    if (opening) turnPage(opening, reading, DTA);
    readTei(
      [front, body].filter((part) => part !== undefined),
      reading,
      work,
      DTA,
    );
    return {
      units: unitsOfSections(reading.sections, (start) => ({
        citation: `${work.citation}, ${start.label}`,
        source: `${VIEW}${work.id}?p=${start.facs}`,
      })),
      licence,
    };
  } finally {
    // Closing only releases the window's timers; parsing is already done.
    void window.happyDOM.close();
  }
}
