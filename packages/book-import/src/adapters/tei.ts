import type { Element, Node } from "happy-dom";
import { currentSection, type TitledSection } from "../sections";
import { sameName } from "./archive-ocr-headings";
import {
  TEXT_NODE,
  emphasised,
  escapeMarkdown,
  isElement,
  mergedEmphasis,
  nameOf,
} from "./markup";

/** How a source sets its text in TEI, where sources differ. */
export interface TeiDialect {
  /** Elements left out with all they hold: apparatus, not the author's text. */
  isSkipped(element: Element): boolean;
  /** Elements that divide the text under a heading. */
  isDivision(element: Element): boolean;
  /** A formula written out. */
  formulaText(formula: Element): string;
  /** Whether a highlight is the author's emphasis, not type set apart. */
  isEmphasis(hi: Element): boolean;
  /** A text's letters as read today. */
  letters(text: string): string;
  /** Whether a page break turns the edition's page. */
  turnsPage(pb: Element): boolean;
}

/** What a work tells the reading about itself. */
export interface TeiWork {
  /** The work's title, which its first heading may repeat. */
  title: string;
  /** Headings of divisions left out with all they hold, e.g. an editor's preface. */
  skipHeadings?: string[];
}

/** A page of the edition, in reading order. */
export interface TeiPage {
  /** Pages in reading order, so notes find their part. */
  page: number;
  /** The page as printed. */
  label: string;
  /** The scan the page is on, where the source numbers its scans. */
  facs: number;
  /** Which of the files read one after another the page is in. */
  part: number;
}

/** A paragraph or note, where its text starts. */
export type TeiBlock = TeiPage & { text: string };

/** What reading gathers, in reading order; one reading may run over several files. */
export interface TeiReading {
  page: TeiPage;
  sections: Array<TitledSection<TeiBlock>>;
  /** Notes by id, so a note continued on the next page joins its start. */
  notes: Map<string, TeiBlock>;
}

export function newTeiReading(): TeiReading {
  return {
    page: { page: 0, label: "", facs: 0, part: 0 },
    sections: [],
    notes: new Map(),
  };
}

/** Elements read as a paragraph of their own. */
const PARAGRAPHS = new Set(["p", "item", "l", "row", "quote", "ab"]);
/** Divisions the text titles by their kind, having no heading of their own. */
const UNTITLED: Record<string, string> = { dedication: "Widmung" };
/** Divisions that only repeat the text's headings. */
const SKIPPED_DIVISIONS = new Set(["contents"]);
/** Marks where the printed line ended; never occurs in the text. */
const LINE_END = "\u2028";
/** Words after a compound's hyphen that show it stands for a word to come. */
const SUSPENDED = "(?:und|oder|wie|bis|sowie|als)";

function childrenOf(node: Node): Node[] {
  return Array.from(node.childNodes);
}

/** Turn to the page a break opens. */
export function turnPage(
  pb: Element,
  reading: TeiReading,
  dialect: TeiDialect,
): void {
  if (!dialect.turnsPage(pb)) return;
  const facs = Number(/(\d+)$/.exec(pb.getAttribute("facs") ?? "")?.[1] ?? 0);
  reading.page = {
    ...reading.page,
    page: reading.page.page + 1,
    label: pb.getAttribute("n") ?? reading.page.label,
    facs,
  };
}

/**
 * An element's text as read: printed line ends kept as marks for now,
 * emphasis marked, a note left as its marker and gathered as a note of its
 * own, a page break moving the page on.
 */
function inlineText(
  node: Node,
  reading: TeiReading,
  dialect: TeiDialect,
  notes = true,
): string {
  if (node.nodeType === TEXT_NODE) {
    return escapeMarkdown(dialect.letters(node.textContent));
  }
  if (!isElement(node)) return "";
  const element = node;
  const name = nameOf(node);
  if (dialect.isSkipped(element)) return "";
  if (name === "lb") return LINE_END;
  if (name === "pb") {
    turnPage(element, reading, dialect);
    return "";
  }
  if (name === "note") {
    if (!notes) return "";
    addNote(element, reading, dialect);
    return escapeMarkdown(element.getAttribute("n") ?? "");
  }
  if (name === "formula") return dialect.formulaText(element);
  if (name === "choice") {
    const chosen =
      Array.from(element.children).find((child) =>
        ["corr", "expan", "reg"].includes(nameOf(child)),
      ) ?? element.children[0];
    return chosen ? inlineText(chosen, reading, dialect, notes) : "";
  }
  const inner = childrenOf(node)
    .map((child) => inlineText(child, reading, dialect, notes))
    .join("");
  if (name === "hi") {
    return dialect.isEmphasis(element) ? emphasised(inner) : inner;
  }
  if (name === "cell") return inner.trim().length > 0 ? ` ${inner} |` : "";
  return inner;
}

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

/** A note, or its continuation joined to the note it goes on from. */
function addNote(
  note: Element,
  reading: TeiReading,
  dialect: TeiDialect,
): void {
  const text = joined(
    childrenOf(note)
      .map((child) => inlineText(child, reading, dialect))
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
  const block: TeiBlock = {
    text: marker ? `${marker} ${text}` : text,
    ...reading.page,
  };
  const id = note.getAttribute("xml:id") ?? note.getAttribute("id");
  if (id) reading.notes.set(id, block);
  currentSection(reading.sections).notes.push(block);
}

function addParagraph(
  element: Element,
  reading: TeiReading,
  dialect: TeiDialect,
): void {
  const page = reading.page;
  const text = joined(inlineText(element, reading, dialect));
  if (text.length === 0) return;
  currentSection(reading.sections).paragraphs.push({ text, ...page });
}

/** A heading as titled: its notes and page breaks left to the reading. */
function titleOf(
  head: Element,
  reading: TeiReading,
  dialect: TeiDialect,
): string {
  const aside: TeiReading = { ...reading, sections: [], notes: new Map() };
  return joined(inlineText(head, aside, dialect, false)).replace(/\*/g, "");
}

/** A heading's notes and page breaks, read into the section it opens. */
function readApparatus(
  node: Node,
  reading: TeiReading,
  dialect: TeiDialect,
): void {
  if (!isElement(node) || dialect.isSkipped(node)) return;
  const name = nameOf(node);
  if (name === "pb") turnPage(node, reading, dialect);
  else if (name === "note") addNote(node, reading, dialect);
  else {
    childrenOf(node).forEach((child) => readApparatus(child, reading, dialect));
  }
}

/** The headings a division stands under, its own last. */
interface Division {
  path: readonly object[];
  titles: string[];
}

function visit(
  node: Node,
  reading: TeiReading,
  division: Division,
  work: TeiWork,
  dialect: TeiDialect,
): void {
  if (!isElement(node) || dialect.isSkipped(node)) return;
  const element = node;
  const name = nameOf(node);
  if (name === "pb") {
    turnPage(element, reading, dialect);
    return;
  }
  if (name === "note") {
    addNote(element, reading, dialect);
    return;
  }
  if (PARAGRAPHS.has(name)) {
    addParagraph(element, reading, dialect);
    return;
  }
  if (dialect.isDivision(element)) {
    const kind = element.getAttribute("type") ?? "";
    if (SKIPPED_DIVISIONS.has(kind)) return;
    const head = Array.from(element.children).find(
      (child) => nameOf(child) === "head",
    );
    const title = head
      ? titleOf(head, reading, dialect)
      : (UNTITLED[kind] ?? null);
    const skipped = (work.skipHeadings ?? []).some(
      (heading) => title !== null && sameName(title, heading),
    );
    if (skipped) {
      // The pages still turn, so the text after it is cited where it stands.
      Array.from(element.getElementsByTagName("pb")).forEach((pb) => {
        turnPage(pb, reading, dialect);
      });
      return;
    }
    // The text may open under the work's own title, which the manifest
    // gives: it titles the text before the first division, and no more.
    const opening =
      title !== null &&
      division.path.length === 0 &&
      sameName(title, work.title);
    const inner: Division =
      title !== null && title.length > 0 && !opening
        ? {
            path: [...division.path, element],
            titles: [...division.titles, title],
          }
        : division;
    if (title !== null && title.length > 0) {
      const own = opening ? { path: [element], titles: [title] } : inner;
      reading.sections.push({ ...own, paragraphs: [], notes: [] });
    }
    if (head) readApparatus(head, reading, dialect);
    childrenOf(element)
      .filter((child) => child !== head)
      .forEach((child) => {
        visit(child, reading, inner, work, dialect);
      });
    return;
  }
  childrenOf(element).forEach((child) => {
    visit(child, reading, division, work, dialect);
  });
}

/**
 * Read TEI into sections: divisions under their headings, paragraphs as
 * printed with words broken over a line joined and emphasis marked, the
 * author's notes after the text of their section, pages as the edition
 * turns them. Reading the roots one after another continues one text.
 */
export function readTei(
  roots: Element[],
  reading: TeiReading,
  work: TeiWork,
  dialect: TeiDialect,
): void {
  roots.forEach((root) => {
    visit(root, reading, { path: [], titles: [] }, work, dialect);
  });
  // Text before the first heading stands under the work's own title.
  const opening = reading.sections[0];
  if (opening?.titles.length === 0) {
    opening.path = [opening];
    opening.titles = [work.title];
  }
}
