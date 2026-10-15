import { Window, type Document, type Element, type Node } from "happy-dom";
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
  titleCased,
} from "./markup";

/** A work on a Wikisource, transcribed from its scans page by page. */
export interface WikisourceWork {
  /** The work's page title on Wikisource: Zur Judenfrage. */
  page: string;
  /** How a citation names the work before its page: Judenfrage, 182. */
  citation: string;
  /** The Wikisource the work is on: de.wikisource.org unless named. */
  site?: string | undefined;
  /** Headings of sections left out, e.g. letters written by others. */
  skipHeadings?: string[];
  /** The heading the work opens with, where the page holds an edition's front matter before it. */
  from?: string | undefined;
  /** The heading after the work, where the page goes on with others. */
  until?: string | undefined;
  /** Centred lines that are the text's own, such as a motto, not headings. */
  textHeadings?: string[];
  /** Centred lines an editor set, neither heading nor text: left out. */
  omitHeadings?: string[];
  /** The page's references are the printed book's notes, not Wikisource's own. */
  printedNotes?: boolean | undefined;
  /** Openings of printed notes left out: an editor's, not the author's. */
  skipNotes?: string[];
}

/** The Wikisource a work is on, unless the manifest names another. */
export const DEFAULT_SITE = "de.wikisource.org";

/** A paragraph, where its text starts. */
interface Block {
  text: string;
  /** Pages in reading order. */
  page: number;
  /** The page as printed. */
  label: string;
  /** The page's anchor on the Wikisource page. */
  anchor: string;
  /** The Wikisource page the text is on. */
  url: string;
}

interface Page {
  page: number;
  label: string;
  anchor: string;
  url: string;
}

interface Reading {
  /** The Wikisource read: its language sets the spacing and casing. */
  site: string;
  page: Page;
  sections: Array<TitledSection<Block>>;
  /** Sections the work leaves out, still opened so their text is held apart. */
  skipped: Set<TitledSection<Block>>;
  /** Before the work's first heading, in it, or past its end. */
  within: "before" | "in" | "after";
  /** The chapter a heading of the page's own opened, its title as printed. */
  chapter: { section: TitledSection<Block>; printed: string } | null;
  /** The section a § opened within the chapter. */
  numbered: TitledSection<Block> | null;
  /** The chapter was just opened: a centred line below it is its title's rest. */
  titling: boolean;
  /** The printed notes kept, by the id their references point to. */
  notes: Map<string, Element>;
  /** Notes marked so far, numbering the next. */
  marked: number;
}

/** A work's page on its Wikisource. */
export function wikisourcePageUrl(
  page: string,
  site: string = DEFAULT_SITE,
): string {
  return `https://${site}/wiki/${encodeURIComponent(page.replace(/ /g, "_"))}`;
}

/** A heading set in capitals in sentence case, as French sets titles; roman numerals stay, an elided article (L’) does not. */
function sentenceCased(line: string): string {
  if (/\p{Ll}/u.test(line)) return line;
  const lowered = line
    .replace(/\p{Lu}+(?!['’])/gu, (word) =>
      /^[IVXLC]+$/u.test(word) ? word : word.toLowerCase(),
    )
    .replace(/\p{Lu}+(?=['’])/gu, (word) => word.toLowerCase());
  return lowered.replace(
    /(^|[.!?]\s+)(\p{Ll})/gu,
    (_match, before: string, letter: string) =>
      `${before}${letter.toUpperCase()}`,
  );
}

/**
 * How a Wikisource's titles in capitals are cased: German capitalises its
 * nouns, French sets titles in sentence case; English capitals stay as
 * printed, since its proper nouns cannot be told from the rest.
 */
function casedFor(site: string): (line: string) => string {
  if (site.startsWith("de.")) return titleCased;
  if (site.startsWith("fr.")) return sentenceCased;
  return (line) => line;
}
/** Wikisource's own apparatus: the text data, its notes and edit links. */
const APPARATUS =
  "#textdaten, ol.references, .mw-heading, .mw-editsection, .ws-noexport, style, meta";
/** A note's reference in the text. */
const REFERENCE = "sup.reference";
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
  return (
    element.classList.contains("PageNumber") ||
    element.classList.contains("ws-pagenum")
  );
}

/** A centred block: in this transcription, a heading. */
function isCentred(element: Element): boolean {
  return (
    element.localName === "center" ||
    element.classList.contains("center") ||
    element.classList.contains("wst-center") ||
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
  const anchor = span.getAttribute("id") ?? "";
  // A page number with no text of its own names its page by its anchor.
  const label = span.textContent.replace(/[[\]\s]/g, "");
  reading.page = {
    ...reading.page,
    page: reading.page.page + 1,
    label: label === "" ? anchor : label,
    anchor,
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
  if (node.matches(REFERENCE)) return noteMark(node, reading);
  const name = nameOf(node);
  if (name === "br") return " ";
  if (name === "hr") return "";
  const inner = Array.from(node.childNodes)
    .map((child) => inlineText(child, reading))
    .join("");
  const set = EMPHASIS.has(name) || styleOf(node).includes("letter-spacing");
  return set ? emphasised(inner) : inner;
}

/**
 * A printed note's mark where its reference stands, the note placed on the
 * page that marks it; a note left out leaves no mark.
 */
function noteMark(reference: Element, reading: Reading): string {
  const id = (reference.querySelector("a")?.getAttribute("href") ?? "").slice(
    1,
  );
  const note = reading.notes.get(id);
  if (!note || reading.within !== "in") return "";
  reading.marked += 1;
  const mark = `${reading.marked})`;
  const text = spaced(inlineText(note, reading), reading.site);
  currentSection(reading.sections).notes.push({
    text: `${mark} ${text}`,
    ...reading.page,
  });
  return mark;
}

/** A heading as titled: its notes' references left out of a copy. */
function unreferenced(block: Element): Element {
  const copy = block.cloneNode(true);
  copy.querySelectorAll(REFERENCE).forEach((reference) => {
    reference.remove();
  });
  return copy;
}

/** A heading's notes, placed in the section it opens; titles carry no marks. */
function markNotes(heading: Element, reading: Reading): void {
  heading.querySelectorAll(REFERENCE).forEach((reference) => {
    noteMark(reference, reading);
  });
}

/** The page's printed notes, by id, but those the work leaves out. */
function printedNotes(
  document: Document,
  work: WikisourceWork,
): Map<string, Element> {
  if (!work.printedNotes) return new Map();
  return new Map(
    Array.from(document.querySelectorAll("ol.references > li")).flatMap(
      (item) => {
        const text = item.querySelector(".reference-text");
        const opening = spaced(
          text?.textContent ?? "",
          work.site ?? DEFAULT_SITE,
        );
        const skipped = (work.skipNotes ?? []).some((skip) =>
          opening.startsWith(skip),
        );
        return text && !skipped ? [[item.id, text] as const] : [];
      },
    ),
  );
}

/** A block's spacing evened; French keeps its space before ; : ! ? as printed. */
function spaced(text: string, site: string): string {
  const tight = site.startsWith("fr.") ? /\s+([,.)])/g : /\s+([,.;:!?)])/g;
  return mergedEmphasis(text).replace(/\s+/g, " ").replace(tight, "$1").trim();
}

function addParagraph(element: Element, reading: Reading): void {
  addRun([element], reading);
}

/** Inline content read as one paragraph, cited from the page it starts on. */
function addRun(nodes: Node[], reading: Reading): void {
  const page = reading.page;
  const text = spaced(
    nodes.map((node) => inlineText(node, reading)).join(""),
    reading.site,
  );
  if (text.length === 0 || reading.within !== "in") return;
  reading.titling = false;
  currentSection(reading.sections).paragraphs.push({ text, ...page });
}

/** Whether a heading opens the work, or ends it: the reading moves on. */
function bound(title: string, reading: Reading, work: WikisourceWork): void {
  if (reading.within === "before" && work.from && sameName(title, work.from)) {
    reading.within = "in";
  } else if (
    reading.within === "in" &&
    work.until &&
    sameName(title, work.until)
  ) {
    reading.within = "after";
  }
}

/** A heading of the page's own, as a chapter: the sections below stand under it. */
function openChapter(
  node: Element,
  reading: Reading,
  work: WikisourceWork,
): void {
  const printed = spaced(inlineText(unreferenced(node), reading), reading.site);
  if (printed === "") return;
  const chapter = reading.chapter;
  // A heading straight below another goes on with its title.
  if (chapter && reading.titling && reading.within === "in") {
    chapter.printed = `${chapter.printed} ${printed}`;
    chapter.section.titles = [casedFor(reading.site)(chapter.printed)];
    markNotes(node, reading);
    return;
  }
  const title = casedFor(reading.site)(printed);
  bound(title, reading, work);
  if (reading.within !== "in") return;
  const section: TitledSection<Block> = {
    path: [node],
    titles: [title],
    paragraphs: [],
    notes: [],
  };
  reading.sections.push(section);
  markNotes(node, reading);
  reading.chapter = { section, printed };
  reading.numbered = null;
  reading.titling = true;
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

/** A block's text as printed, its lines run together. */
function blockText(block: Element, reading: Reading): string {
  return spaced(
    unreferenced(block).textContent.replace(/\*/g, ""),
    reading.site,
  );
}

/**
 * A centred block as a heading: its lines joined, the byline (Von / Karl
 * Marx) left out, capitals cased.
 */
function headingOf(block: Element, reading: Reading): string | null {
  const lines = blockLines(unreferenced(block), reading)
    .split(LINE_END)
    .map((line) => spaced(line.replace(/\*/g, ""), reading.site))
    .filter((line) => line.length > 0);
  const kept = lines.filter((line, index) => {
    if (/^von\b/i.test(line)) return false;
    return !/^von$/i.test(lines[index - 1] ?? "");
  });
  return kept.length > 0 ? casedFor(reading.site)(kept.join(" ")) : null;
}

/** Elements set as blocks of their own, not within a line. */
const BLOCKS = new Set([
  "div",
  "p",
  "center",
  "h2",
  "h3",
  "h4",
  "ol",
  "ul",
  "li",
  "dl",
  "dd",
  "table",
  "blockquote",
]);

function isBlock(node: Node): boolean {
  return isElement(node) && BLOCKS.has(nameOf(node));
}

/** Text standing directly in a block, outside any paragraph. */
function isBareText(node: Node): boolean {
  return node.nodeType === TEXT_NODE && node.textContent.trim().length > 0;
}

/** A printed rule: a line, or Wikisource's rule drawn in segments. */
function isRule(node: Node): boolean {
  return (
    isElement(node) &&
    (nameOf(node) === "hr" ||
      node.classList.contains("wst-custom-rule") ||
      node.classList.contains("wst-rule"))
  );
}

/** A centred block a rule parts into blocks of its own, as the salutation above a section's numeral. */
function partedByRules(block: Element): Element[] {
  const children = Array.from(block.childNodes);
  if (!children.some(isRule)) return [block];
  const groups = children.reduce<Node[][]>(
    (found, child) =>
      isRule(child)
        ? [...found, []]
        : [...found.slice(0, -1), [...(found.at(-1) ?? []), child]],
    [[]],
  );
  return groups.map((group) => {
    const part = block.cloneNode(false);
    group.forEach((child) => {
      part.appendChild(child);
    });
    return part;
  });
}

/** A heading's letters alone, to tell what it spells however it is set. */
function lettersOf(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\p{L}\p{N}]/gu, "");
}

/** Whether a heading is nothing but an editor's captions, one after another. */
function captionOnly(title: string, captions: string[]): boolean {
  const spelled = captions.map(lettersOf).filter((caption) => caption !== "");
  const covered = (rest: string): boolean =>
    rest === "" ||
    spelled.some(
      (caption) =>
        rest.startsWith(caption) && covered(rest.slice(caption.length)),
    );
  return spelled.length > 0 && covered(lettersOf(title));
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
  if (/^h[2-4]$/u.test(name)) {
    openChapter(node, reading, work);
    return;
  }
  if (name === "center" || (name === "div" && isCentred(node))) {
    const parts = partedByRules(node);
    if (parts.length > 1) {
      parts.forEach((part) => {
        visit(part, reading, work);
      });
      return;
    }
    const cased = casedFor(reading.site);
    const title = headingOf(node, reading);
    if (title === null) return;
    bound(title, reading, work);
    if (reading.within !== "in") return;
    if (captionOnly(title, work.omitHeadings ?? [])) return;
    if ((work.textHeadings ?? []).some((line) => sameName(title, line))) {
      addParagraph(node, reading);
      return;
    }
    const chapter = reading.chapter;
    // A chapter's title may go on below its heading, its number above it.
    if (chapter && reading.titling && !title.startsWith("§")) {
      chapter.printed = `${chapter.printed}. ${blockText(node, reading)}`;
      chapter.section.titles = [cased(chapter.printed)];
      markNotes(node, reading);
      return;
    }
    reading.titling = false;
    const skipped = (work.skipHeadings ?? []).some((heading) =>
      sameName(title, heading),
    );
    // Under a chapter, a § opens a section of it, and other headings a part
    // of the section open.
    const under =
      chapter === null
        ? []
        : title.startsWith("§") || reading.numbered === null
          ? [chapter.section]
          : [chapter.section, reading.numbered];
    const section: TitledSection<Block> = {
      path: [...under.map((above) => above.path.at(-1) ?? above), node],
      titles: [...under.map((above) => above.titles.at(-1) ?? ""), title],
      paragraphs: [],
      notes: [],
    };
    if (chapter && (title.startsWith("§") || reading.numbered === null)) {
      reading.numbered = section;
    }
    reading.sections.push(section);
    markNotes(node, reading);
    if (skipped) reading.skipped.add(section);
    return;
  }
  const children = Array.from(node.childNodes);
  if (!children.some(isBareText)) {
    children.forEach((child) => visit(child, reading, work));
    return;
  }
  // A block with text of its own, as a quotation set apart: each run of its
  // text is a paragraph, a block within it read as it stands.
  const runs = children.reduce<Node[][]>(
    (found, child) => {
      if (isBlock(child)) return [...found, [child], []];
      const last = found.at(-1) ?? [];
      return [...found.slice(0, -1), [...last, child]];
    },
    [[]],
  );
  runs.forEach((run) => {
    const only = run[0];
    if (run.length === 1 && only && isBlock(only)) {
      visit(only, reading, work);
    } else {
      addRun(run, reading);
    }
  });
}

/** One of the Wikisource pages a work is read from, as rendered. */
export interface WikisourcePage {
  /** The page's title: The Civil War in France (1871)/Chapter 1. */
  page: string;
  html: string;
}

/**
 * Read a work transcribed on Wikisource from its rendered page: each centred
 * heading opens a section, paragraphs and datelines as printed with spaced
 * or italic emphasis marked, each part cited by work and printed page.
 * Wikisource's text data and its own notes are left out.
 */
export function parseWikisourcePage(
  html: string,
  work: WikisourceWork,
): BookUnit[] {
  return parseWikisourcePages([{ page: work.page, html }], work);
}

/**
 * Read a work set out over several Wikisource pages, as one reading in their
 * order: each part cited from the page it is on.
 */
export function parseWikisourcePages(
  pages: WikisourcePage[],
  work: WikisourceWork,
): BookUnit[] {
  const window = new Window();
  try {
    const document = window.document;
    const site = work.site ?? DEFAULT_SITE;
    const reading: Reading = {
      site,
      page: { page: 0, label: "", anchor: "", url: "" },
      sections: [],
      skipped: new Set(),
      within: work.from ? "before" : "in",
      chapter: null,
      numbered: null,
      titling: false,
      notes: new Map(),
      marked: 0,
    };
    pages.forEach(({ page, html }) => {
      document.body.innerHTML = html;
      // Each page numbers its own notes.
      reading.notes = printedNotes(document, work);
      if (!work.printedNotes) {
        document.querySelectorAll(REFERENCE).forEach((element) => {
          element.remove();
        });
      }
      document.querySelectorAll(APPARATUS).forEach((element) => {
        element.remove();
      });
      reading.page = { ...reading.page, url: wikisourcePageUrl(page, site) };
      visit(document.body, reading, work);
    });
    const kept = reading.sections.filter(
      (section) => !reading.skipped.has(section),
    );
    return unitsOfSections(kept, (start) => ({
      citation: `${work.citation}, ${start.label}`,
      source: `${start.url}#${start.anchor}`,
    }));
  } finally {
    // Closing only releases the window's timers; parsing is already done.
    void window.happyDOM.close();
  }
}
