import { Window, type Element, type Node } from "happy-dom";
import type { BookUnit } from "../render-book";
import {
  currentSection,
  unitsOfSections,
  type TitledSection,
} from "../sections";
import { sameName } from "./archive-ocr-headings";
import {
  TEXT_NODE,
  emphasised,
  escapeMarkdown,
  isElement,
  mergedEmphasis,
  nameOf,
} from "./markup";

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

/** A paragraph or note, where its text starts. */
interface Block {
  text: string;
  /** Pages in reading order, so notes find their part. */
  page: number;
  /** The page as printed. */
  label: string;
  /** The scan the page is on, as the Textarchiv numbers it. */
  facs: number;
}

interface Page {
  page: number;
  label: string;
  facs: number;
}

/** What reading the body gathers, in reading order. */
interface Reading {
  page: Page;
  sections: Array<TitledSection<Block>>;
  /** Notes by id, so a note continued on the next page joins its start. */
  notes: Map<string, Block>;
}

const VIEW = "https://www.deutschestextarchiv.de/book/view/";
/** Elements that are the page's apparatus, not the author's text. */
const SKIPPED = new Set(["fw", "figure", "milestone", "gap", "titlePage"]);
/** Elements read as a paragraph of their own. */
const PARAGRAPHS = new Set(["p", "item", "l", "row", "quote"]);
/** Divisions the text titles by their kind, having no heading of their own. */
const UNTITLED: Record<string, string> = { dedication: "Widmung" };
/** Divisions that only repeat the text's headings. */
const SKIPPED_DIVISIONS = new Set(["contents"]);
/** Marks where the printed line ended; never occurs in the text. */
const LINE_END = "\u2028";

function childrenOf(node: Node): Node[] {
  return Array.from(node.childNodes);
}

/** A TeX formula written out: a fraction as a/b, other markup dropped. */
function formulaText(tex: string): string {
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

/**
 * An element's text as read: printed line ends kept as marks for now,
 * emphasis marked, a note left as its marker and gathered as a note of its
 * own, a page break moving the page on.
 */
function inlineText(node: Node, reading: Reading, notes = true): string {
  if (node.nodeType === TEXT_NODE) {
    return escapeMarkdown(
      node.textContent.replace(/ſ/g, "s").replace(/ꝛc\./g, "etc."),
    );
  }
  if (!isElement(node)) return "";
  const element = node;
  const name = nameOf(node);
  if (SKIPPED.has(name)) return "";
  if (name === "lb") return LINE_END;
  if (name === "pb") {
    turnPage(element, reading);
    return "";
  }
  if (name === "note") {
    if (!notes) return "";
    addNote(element, reading);
    return escapeMarkdown(element.getAttribute("n") ?? "");
  }
  if (name === "formula") return formulaText(element.textContent);
  if (name === "choice") {
    const reading_ =
      Array.from(element.children).find((child) =>
        ["corr", "expan", "reg"].includes(nameOf(child)),
      ) ?? element.children[0];
    return reading_ ? inlineText(reading_, reading, notes) : "";
  }
  const inner = childrenOf(node)
    .map((child) => inlineText(child, reading, notes))
    .join("");
  if (name === "hi") return emphasised(inner);
  if (name === "cell") return ` ${inner} |`;
  return inner;
}

/** Words after a compound's hyphen that show it stands for a word to come. */
const SUSPENDED = "(?:und|oder|wie|bis|sowie|als)";

/**
 * A line's end read: a word broken over it is one word again where it goes
 * on in small letters, through emphasis marks, and a compound keeps its
 * hyphen, as does a part standing for a word to come (Silber- und Goldmünzen);
 * any other end is a space. Fraktur prints the hyphen as ¬.
 */
function joined(text: string): string {
  return mergedEmphasis(text)
    .replace(new RegExp(`\\s*${LINE_END}\\s*`, "g"), LINE_END)
    .replace(
      new RegExp(
        `(\\p{L})(\\*?)[-¬]${LINE_END}(?=\\*?${SUSPENDED}(?!\\p{L}))`,
        "gu",
      ),
      "$1$2- ",
    )
    .replace(new RegExp(`(\\p{L})\\*[-¬]${LINE_END}\\*(\\p{Ll})`, "gu"), "$1$2")
    .replace(
      new RegExp(`(\\p{L})(\\*?)[-¬]${LINE_END}(\\*?)(\\p{Ll})`, "gu"),
      "$1$2$3$4",
    )
    .replace(new RegExp(`(\\p{L})(\\*?)[-¬]${LINE_END}`, "gu"), "$1$2-")
    .replace(new RegExp(LINE_END, "g"), " ")
    .replace(/\s+/g, " ")
    .replace(/\s+([,.;:!?)])/g, "$1")
    .replace(/\s*\|$/, "")
    .trim();
}

function turnPage(pb: Element, reading: Reading): void {
  const facs = Number(/(\d+)$/.exec(pb.getAttribute("facs") ?? "")?.[1] ?? 0);
  reading.page = {
    page: reading.page.page + 1,
    label: pb.getAttribute("n") ?? reading.page.label,
    facs,
  };
}

/** A note, or its continuation joined to the note it goes on from. */
function addNote(note: Element, reading: Reading): void {
  const text = joined(
    childrenOf(note)
      .map((child) => inlineText(child, reading))
      .join(""),
  );
  const previous = (note.getAttribute("prev") ?? "").replace(/^#/, "");
  const before = reading.notes.get(previous);
  if (before) {
    before.text = `${before.text} ${text}`;
    const id = note.getAttribute("xml:id") ?? note.getAttribute("id");
    if (id) reading.notes.set(id, before);
    return;
  }
  const marker = escapeMarkdown(note.getAttribute("n") ?? "");
  const block: Block = {
    text: marker ? `${marker} ${text}` : text,
    ...reading.page,
  };
  const id = note.getAttribute("xml:id") ?? note.getAttribute("id");
  if (id) reading.notes.set(id, block);
  currentSection(reading.sections).notes.push(block);
}

function addParagraph(element: Element, reading: Reading): void {
  const page = reading.page;
  const text = joined(inlineText(element, reading));
  if (text.length === 0) return;
  currentSection(reading.sections).paragraphs.push({ text, ...page });
}

/** A heading as titled: its notes and page breaks left to the reading. */
function titleOf(head: Element, reading: Reading): string {
  const aside: Reading = { ...reading, sections: [], notes: new Map() };
  return joined(inlineText(head, aside, false)).replace(/\*/g, "");
}

/** A heading's notes and page breaks, read into the section it opens. */
function readApparatus(node: Node, reading: Reading): void {
  if (!isElement(node)) return;
  const name = nameOf(node);
  if (name === "pb") turnPage(node, reading);
  else if (name === "note") addNote(node, reading);
  else childrenOf(node).forEach((child) => readApparatus(child, reading));
}

/** The headings a division stands under, its own last. */
interface Division {
  path: readonly object[];
  titles: string[];
}

function visit(
  node: Node,
  reading: Reading,
  division: Division,
  work: DtaTeiWork,
): void {
  const name = nameOf(node);
  if (!isElement(node) || SKIPPED.has(name)) return;
  const element = node;
  if (name === "pb") {
    turnPage(element, reading);
    return;
  }
  if (name === "note") {
    addNote(element, reading);
    return;
  }
  if (PARAGRAPHS.has(name)) {
    addParagraph(element, reading);
    return;
  }
  if (name === "div") {
    const kind = element.getAttribute("type") ?? "";
    if (SKIPPED_DIVISIONS.has(kind)) return;
    const head = Array.from(element.children).find(
      (child) => nameOf(child) === "head",
    );
    const title = head ? titleOf(head, reading) : (UNTITLED[kind] ?? null);
    const skipped = (work.skipHeadings ?? []).some(
      (heading) => title !== null && sameName(title, heading),
    );
    if (skipped) {
      // The pages still turn, so the text after it is cited where it stands.
      Array.from(element.getElementsByTagName("pb")).forEach((pb) =>
        turnPage(pb, reading),
      );
      return;
    }
    // The text may open under the work's own title, which the manifest
    // gives: it titles the text before the first division, and no more.
    const opening =
      title !== null &&
      division.path.length === 0 &&
      sameName(title, work.title);
    const inner: Division =
      title !== null && !opening
        ? {
            path: [...division.path, element],
            titles: [...division.titles, title],
          }
        : division;
    if (title !== null) {
      const own = opening ? { path: [element], titles: [title] } : inner;
      reading.sections.push({ ...own, paragraphs: [], notes: [] });
    }
    if (head) readApparatus(head, reading);
    childrenOf(element)
      .filter((child) => child !== head)
      .forEach((child) => visit(child, reading, inner, work));
    return;
  }
  childrenOf(element).forEach((child) => visit(child, reading, division, work));
}

/**
 * Read a Deutsches Textarchiv TEI text: the body's divisions as sections
 * under their headings after the front matter's, paragraphs as printed with words broken over a line
 * joined, spaced or italic emphasis marked, the author's notes after the
 * text, each part cited by work and printed page. The title page, back
 * matter, running heads and signatures are left out.
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
    const reading: Reading = {
      page: { page: 0, label: "", facs: 0 },
      sections: [],
      notes: new Map(),
    };
    if (opening) turnPage(opening, reading);
    [front, body].forEach((part) => {
      if (part) visit(part, reading, { path: [], titles: [] }, work);
    });
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
