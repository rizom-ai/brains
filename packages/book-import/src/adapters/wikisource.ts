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

/** A work on de.wikisource.org, transcribed from its scans page by page. */
export interface WikisourceWork {
  /** The work's page title on Wikisource: Zur Judenfrage. */
  page: string;
  /** How a citation names the work before its page: Judenfrage, 182. */
  citation: string;
  /** Headings of sections left out, e.g. letters written by others. */
  skipHeadings?: string[];
}

/** A paragraph, where its text starts. */
interface Block {
  text: string;
  /** Pages in reading order. */
  page: number;
  /** The page as printed. */
  label: string;
  /** The page's anchor on the Wikisource page. */
  anchor: string;
}

interface Page {
  page: number;
  label: string;
  anchor: string;
}

interface Reading {
  page: Page;
  sections: Array<TitledSection<Block>>;
  /** Sections the work leaves out, still opened so their text is held apart. */
  skipped: Set<TitledSection<Block>>;
}

/** A work's page on de.wikisource.org. */
export function wikisourcePageUrl(page: string): string {
  return `https://de.wikisource.org/wiki/${encodeURIComponent(page.replace(/ /g, "_"))}`;
}
/** Wikisource's own apparatus: the text data, its notes and edit links. */
const APPARATUS =
  "#textdaten, sup.reference, ol.references, .mw-heading, .mw-editsection, .ws-noexport, style, meta";
/** Elements read as a paragraph of their own. */
const PARAGRAPHS = new Set(["p", "dd", "li"]);
/** Elements whose text is the author's emphasis. */
const EMPHASIS = new Set(["i", "em", "b", "strong"]);
/** Marks where a printed line of a heading ended; never occurs in the text. */
const LINE_END = "\u2028";

function styleOf(element: Element): string {
  return (element.getAttribute("style") ?? "").replace(/\s/g, "");
}

function isPageNumber(element: Element): boolean {
  return element.classList.contains("PageNumber");
}

/** A centred block: in this transcription, a heading. */
function isCentred(element: Element): boolean {
  return (
    element.localName === "center" ||
    element.classList.contains("center") ||
    styleOf(element).includes("text-align:center")
  );
}

/** A block set to the right: a dateline or a signature, read as a paragraph. */
function isRightAligned(element: Element): boolean {
  return (
    element.getAttribute("align") === "right" ||
    styleOf(element).includes("text-align:right")
  );
}

function turnPage(span: Element, reading: Reading): void {
  reading.page = {
    page: reading.page.page + 1,
    label: span.textContent.replace(/[[\]\s]/g, ""),
    anchor: span.getAttribute("id") ?? "",
  };
}

/** An element's text as read: emphasis marked, a page number moving the page on. */
function inlineText(node: Node, reading: Reading): string {
  if (node.nodeType === TEXT_NODE) {
    return escapeMarkdown(node.textContent);
  }
  if (!isElement(node)) return "";
  if (isPageNumber(node)) {
    turnPage(node, reading);
    return "";
  }
  const name = nameOf(node);
  if (name === "br") return " ";
  if (name === "hr") return "";
  const inner = Array.from(node.childNodes)
    .map((child) => inlineText(child, reading))
    .join("");
  const set = EMPHASIS.has(name) || styleOf(node).includes("letter-spacing");
  return set ? emphasised(inner) : inner;
}

function spaced(text: string): string {
  return mergedEmphasis(text)
    .replace(/\s+/g, " ")
    .replace(/\s+([,.;:!?)])/g, "$1")
    .trim();
}

function addParagraph(element: Element, reading: Reading): void {
  const page = reading.page;
  const text = spaced(inlineText(element, reading));
  if (text.length === 0) return;
  currentSection(reading.sections).paragraphs.push({ text, ...page });
}

/** A heading set in capitals, cased as a title. */
function cased(line: string): string {
  if (/\p{Ll}/u.test(line)) return line;
  return line.replace(
    /\p{Lu}+/gu,
    (word) => `${word.charAt(0)}${word.slice(1).toLowerCase()}`,
  );
}

/** A centred block's lines, broken at its line breaks and rules. */
function blockLines(node: Node, reading: Reading): string {
  if (!isElement(node)) return inlineText(node, reading);
  if (isPageNumber(node)) return inlineText(node, reading);
  const name = nameOf(node);
  if (name === "br" || name === "hr") return LINE_END;
  return Array.from(node.childNodes)
    .map((child) => blockLines(child, reading))
    .join("");
}

/**
 * A centred block as a heading: its lines joined, the byline (Von / Karl
 * Marx) left out, capitals cased.
 */
function headingOf(block: Element, reading: Reading): string | null {
  const lines = blockLines(block, reading)
    .split(LINE_END)
    .map((line) => spaced(line.replace(/\*/g, "")))
    .filter((line) => line.length > 0);
  const kept = lines.filter((line, index) => {
    if (/^von\b/i.test(line)) return false;
    return !/^von$/i.test(lines[index - 1] ?? "");
  });
  return kept.length > 0 ? cased(kept.join(" ")) : null;
}

function visit(node: Node, reading: Reading, work: WikisourceWork): void {
  if (!isElement(node)) return;
  if (isPageNumber(node)) {
    turnPage(node, reading);
    return;
  }
  const name = nameOf(node);
  if (PARAGRAPHS.has(name) || (name === "div" && isRightAligned(node))) {
    addParagraph(node, reading);
    return;
  }
  if (name === "center" || (name === "div" && isCentred(node))) {
    const title = headingOf(node, reading);
    if (title === null) return;
    const skipped = (work.skipHeadings ?? []).some((heading) =>
      sameName(title, heading),
    );
    const section: TitledSection<Block> = {
      path: [node],
      titles: [title],
      paragraphs: [],
      notes: [],
    };
    reading.sections.push(section);
    if (skipped) reading.skipped.add(section);
    return;
  }
  Array.from(node.childNodes).forEach((child) => visit(child, reading, work));
}

/**
 * Read a work transcribed on de.wikisource.org from its rendered page: each
 * centred heading opens a section, paragraphs and datelines as printed with
 * spaced or italic emphasis marked, each part cited by work and printed page.
 * Wikisource's text data and its own notes are left out.
 */
export function parseWikisourcePage(
  html: string,
  work: WikisourceWork,
): BookUnit[] {
  const window = new Window();
  try {
    const document = window.document;
    document.body.innerHTML = html;
    document.querySelectorAll(APPARATUS).forEach((element) => {
      element.remove();
    });
    const reading: Reading = {
      page: { page: 0, label: "", anchor: "" },
      sections: [],
      skipped: new Set(),
    };
    visit(document.body, reading, work);
    const kept = reading.sections.filter(
      (section) => !reading.skipped.has(section),
    );
    const page = wikisourcePageUrl(work.page);
    return unitsOfSections(kept, (start) => ({
      citation: `${work.citation}, ${start.label}`,
      source: `${page}#${start.anchor}`,
    }));
  } finally {
    // Closing only releases the window's timers; parsing is already done.
    void window.happyDOM.close();
  }
}
