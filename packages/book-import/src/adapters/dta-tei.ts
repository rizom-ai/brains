import { Window, type Element, type Node } from "happy-dom";
import type { BookUnit } from "../render-book";
import { unitsOfSections, type TitledSection } from "../sections";
import { sameName } from "./archive-ocr-headings";

const ELEMENT_NODE = 1;
const TEXT_NODE = 3;

/** A work in the Deutsches Textarchiv. */
export interface DtaTeiWork {
  /** The text's id, e.g. marx_kapital01_1867. */
  id: string;
  /** How a citation names the work before its page: Kapital I. */
  citation: string;
  /** The work's title, which the body's first heading may repeat. */
  title: string;
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
const SKIPPED = new Set(["fw", "figure", "milestone", "gap"]);
/** Elements read as a paragraph of their own. */
const PARAGRAPHS = new Set(["p", "item", "l", "row", "quote"]);
/** Characters markdown would read as markup; the text keeps them literal. */
const MARKDOWN_SPECIAL = /[\\`*_<>]/g;
/** Marks where the printed line ended; never occurs in the text. */
const LINE_END = " ";

function isElement(node: Node): node is Element {
  return node.nodeType === ELEMENT_NODE;
}

function nameOf(node: Node): string {
  return isElement(node) ? node.localName : "";
}

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
function inlineText(node: Node, reading: Reading): string {
  if (node.nodeType === TEXT_NODE) {
    return node.textContent.replace(MARKDOWN_SPECIAL, (c) => `\\${c}`);
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
    addNote(element, reading);
    return element.getAttribute("n") ?? "";
  }
  if (name === "formula") return formulaText(element.textContent);
  if (name === "choice") {
    const reading_ =
      Array.from(element.children).find((child) =>
        ["corr", "expan", "reg"].includes(nameOf(child)),
      ) ?? element.children[0];
    return reading_ ? inlineText(reading_, reading) : "";
  }
  const inner = childrenOf(node)
    .map((child) => inlineText(child, reading))
    .join("");
  if (name === "hi") {
    const word = inner.trim();
    if (word.length === 0) return inner;
    const lead = inner.slice(0, inner.length - inner.trimStart().length);
    const trail = inner.slice(inner.trimEnd().length);
    return `${lead}*${word}*${trail}`;
  }
  if (name === "cell") return ` ${inner} |`;
  return inner;
}

/**
 * A line's end read: a word broken over it is one word again where it goes
 * on in small letters, through an emphasis mark; any other end is a space.
 */
function joined(text: string): string {
  return text
    .replace(new RegExp(`\\s*${LINE_END}\\s*`, "g"), LINE_END)
    .replace(new RegExp(`(\\p{L})-${LINE_END}(\\*?)(\\p{Ll})`, "gu"), "$1$2$3")
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

function currentSection(reading: Reading): TitledSection<Block> {
  const last = reading.sections.at(-1);
  if (last) return last;
  const opening: TitledSection<Block> = {
    path: [],
    titles: [],
    paragraphs: [],
    notes: [],
  };
  reading.sections.push(opening);
  return opening;
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
  const marker = note.getAttribute("n");
  const block: Block = {
    text: marker ? `${marker} ${text}` : text,
    ...reading.page,
  };
  const id = note.getAttribute("xml:id") ?? note.getAttribute("id");
  if (id) reading.notes.set(id, block);
  currentSection(reading).notes.push(block);
}

function addParagraph(element: Element, reading: Reading): void {
  const page = reading.page;
  const text = joined(inlineText(element, reading));
  if (text.length === 0) return;
  currentSection(reading).paragraphs.push({ text, ...page });
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
  workTitle: string,
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
    const head = Array.from(element.children).find(
      (child) => nameOf(child) === "head",
    );
    const title = head
      ? joined(inlineText(head, reading)).replace(/\*/g, "")
      : null;
    // The body may open with the work's own title, which the manifest gives.
    const own =
      title !== null &&
      !(division.path.length === 0 && sameName(title, workTitle));
    const inner: Division = own
      ? {
          path: [...division.path, element],
          titles: [...division.titles, title],
        }
      : division;
    if (own) {
      reading.sections.push({ ...inner, paragraphs: [], notes: [] });
    }
    childrenOf(element)
      .filter((child) => child !== head)
      .forEach((child) => visit(child, reading, inner, workTitle));
    return;
  }
  childrenOf(element).forEach((child) =>
    visit(child, reading, division, workTitle),
  );
}

/**
 * Read a Deutsches Textarchiv TEI text: the body's divisions as sections
 * under their headings, paragraphs as printed with words broken over a line
 * joined, spaced or italic emphasis marked, the author's notes after the
 * text, each part cited by work and printed page. The title page, front and
 * back matter, running heads and signatures are left out.
 */
export function parseDtaTei(xml: string, work: DtaTeiWork): DtaTeiText {
  const window = new Window();
  try {
    const document = new window.DOMParser().parseFromString(
      xml,
      "application/xml",
    );
    const body = document.getElementsByTagName("body")[0];
    const licence =
      document.getElementsByTagName("licence")[0]?.getAttribute("target") ??
      null;
    if (!body) return { units: [], licence };
    // The page the body opens on is the last break before it.
    const breaks = Array.from(document.getElementsByTagName("pb"));
    const opening = breaks
      .filter((pb) => (pb.compareDocumentPosition(body) & 4) === 4)
      .at(-1);
    const reading: Reading = {
      page: { page: 0, label: "", facs: 0 },
      sections: [],
      notes: new Map(),
    };
    if (opening) turnPage(opening, reading);
    visit(body, reading, { path: [], titles: [] }, work.title);
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
