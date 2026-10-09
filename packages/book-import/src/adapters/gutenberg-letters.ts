import { Window, type Element, type Node } from "happy-dom";
import type { BookUnit } from "../render-book";
import { unitsOfSections, type TitledSection } from "../sections";
import {
  TEXT_NODE,
  emphasised,
  escapeMarkdown,
  isElement,
  mergedEmphasis,
  nameOf,
} from "./markup";

/**
 * An edition of letters on Project Gutenberg, set in its HTML as parts
 * (h2.part), years (h4.year) and letters (h5.letter), each letter with its
 * dateline, salutation and signature marked; of them, one writer's are read.
 */
export interface GutenbergLetters {
  /** The ebook's number: 64327. */
  ebook: number;
  /** How a citation names the edition before its page: Briefwechsel I, 23. */
  citation: string;
  /** How the writer's letters are known. */
  writer: {
    /** The writer's signatures, without the closing (Dein K. M. is K. M.). */
    signatures: string[];
    /** Salutations of the writer's letters, for a letter left unsigned. */
    salutations: string[];
  };
}

/** A paragraph, where its text starts. */
interface Block {
  text: string;
  /** Pages in reading order. */
  page: number;
  /** The page as printed. */
  label: string;
  /** The page's anchor in the ebook. */
  anchor: string;
}

interface Page {
  page: number;
  label: string;
  anchor: string;
}

interface Heading {
  element: object;
  title: string;
}

interface Letter {
  section: TitledSection<Block>;
  number: string;
  dated: boolean;
  salutation: string | null;
  signatures: string[];
}

interface Reading {
  page: Page;
  part: Heading | null;
  year: Heading | null;
  /** The letter being read; none in the editors' text. */
  letter: Letter | null;
  letters: Letter[];
}

/** The editors' text about a letter, and their notes. */
const EDITORIAL = new Set(["note", "footnote", "footnote2"]);
/** Elements read as a paragraph of their own. */
const READ = new Set(["p", "tr", "blockquote"]);
/** Elements whose text is the writer's emphasis. */
const EMPHASIS = new Set(["em", "i", "b", "strong"]);
/** Words that close a letter before the signature. */
const CLOSING = /^(?:(?:Dein|Deinem|Euer|Ihr|Ihre|Salut!)\s+)+/;

function textOf(element: Element): string {
  return element.textContent.replace(/\s+/g, " ").trim();
}

function turnPage(anchor: Element, reading: Reading): void {
  reading.page = {
    page: reading.page.page + 1,
    label: anchor.getAttribute("title") ?? "",
    anchor: anchor.getAttribute("id") ?? "",
  };
}

/** Pages turned within text that is not read. */
function turnPagesIn(element: Element, reading: Reading): void {
  if (element.matches("a.pagenum")) turnPage(element, reading);
  element.querySelectorAll("a.pagenum").forEach((anchor) => {
    turnPage(anchor, reading);
  });
}

/** An element's text as read: emphasis marked, note markers left out. */
function inlineText(node: Node, reading: Reading): string {
  if (node.nodeType === TEXT_NODE) return escapeMarkdown(node.textContent);
  if (!isElement(node)) return "";
  if (node.matches("a.pagenum")) {
    turnPage(node, reading);
    return "";
  }
  if (node.matches("a.fnote")) return "";
  if (node.matches("span.lfrac")) return ` ${node.textContent.trim()}`;
  const name = nameOf(node);
  if (name === "br") return " ";
  const inner = Array.from(node.childNodes)
    .map((child) => inlineText(child, reading))
    .join("");
  if (name === "td" || name === "th") return ` ${inner.trim()} |`;
  return EMPHASIS.has(name) ? emphasised(inner) : inner;
}

function spaced(text: string): string {
  return mergedEmphasis(text)
    .replace(/\s+/g, " ")
    .replace(/\s+([,.;:!?)])/g, "$1")
    .replace(/\s*\|$/, "")
    .trim();
}

/** A heading's lines as one title: Erster Abschnitt. Die ersten Jahre. */
function titleOf(heading: Element, reading: Reading): string {
  turnPagesIn(heading, reading);
  return heading.innerHTML
    .split(/<br\s*\/?>/i)
    .map((line) => spaced(line.replace(/<[^>]+>/g, " ")))
    .filter((line) => line.length > 0)
    .reduce(
      (title, line) =>
        title.length === 0
          ? line
          : `${title}${/[.:!?]$/.test(title) ? "" : "."} ${line}`,
      "",
    );
}

function openLetter(heading: Element, reading: Reading): void {
  turnPagesIn(heading, reading);
  const number = textOf(heading);
  const above = [reading.part, reading.year].filter(
    (found): found is Heading => found !== null,
  );
  const letter: Letter = {
    section: {
      path: [...above.map((found) => found.element), heading],
      titles: [...above.map((found) => found.title), number],
      paragraphs: [],
      notes: [],
    },
    number,
    dated: false,
    salutation: null,
    signatures: [],
  };
  reading.letter = letter;
  reading.letters.push(letter);
}

function addParagraph(
  element: Element,
  letter: Letter,
  reading: Reading,
): void {
  const page = reading.page;
  const text = spaced(inlineText(element, reading));
  if (text.length === 0) return;
  letter.section.paragraphs.push({ text, ...page });
  if (element.classList.contains("date") && !letter.dated) {
    letter.dated = true;
    letter.section.titles = [
      ...letter.section.titles.slice(0, -1),
      `${letter.number}. ${text}`,
    ];
  }
  if (element.classList.contains("addr")) letter.salutation ??= text;
  if (element.classList.contains("sign")) letter.signatures.push(text);
}

function visit(node: Node, reading: Reading): void {
  if (!isElement(node)) return;
  const name = nameOf(node);
  if (node.matches("a.pagenum")) {
    turnPage(node, reading);
    return;
  }
  if (node.classList.contains("pg-boilerplate")) return;
  if (name === "h5" && node.classList.contains("letter")) {
    openLetter(node, reading);
    return;
  }
  if (/^h[1-4]$/.test(name)) {
    // A heading above the letters ends the letter; the editors' own
    // sections (preface, introductions) are not read.
    reading.letter = null;
    if (name === "h2") {
      const part = node.classList.contains("part");
      reading.part = part
        ? { element: node, title: titleOf(node, reading) }
        : null;
      reading.year = null;
      if (!part) turnPagesIn(node, reading);
      return;
    }
    if (name === "h4" && node.classList.contains("year")) {
      reading.year = { element: node, title: titleOf(node, reading) };
      return;
    }
    turnPagesIn(node, reading);
    return;
  }
  const editorial = Array.from(node.classList).some((kind) =>
    EDITORIAL.has(kind),
  );
  const letter = reading.letter;
  if (READ.has(name) && letter && !editorial) {
    addParagraph(node, letter, reading);
    return;
  }
  if (READ.has(name) || editorial || name === "hr") {
    turnPagesIn(node, reading);
    return;
  }
  Array.from(node.childNodes).forEach((child) => visit(child, reading));
}

/** A signature's name, its closing words and the editors' brackets left out. */
function signed(signature: string): string {
  return signature
    .replace(/[[\]]/g, "")
    .replace(CLOSING, "")
    .replace(/\.$/, "")
    .trim();
}

/**
 * The writer's letter: one the writer signs, or, left unsigned (bar the
 * editors' bracketed remark), one that opens with the writer's salutation.
 * A signature in quotation marks closes a letter the writer quotes.
 */
function isWriters(
  letter: Letter,
  writer: GutenbergLetters["writer"],
): boolean {
  const own = letter.signatures.filter((signature) => !/[“"]$/.test(signature));
  const names = writer.signatures.map(signed);
  if (own.some((signature) => names.includes(signed(signature)))) return true;
  const unsigned = own.every((signature) => /^\[.*\]$/.test(signature));
  return unsigned && writer.salutations.includes(letter.salutation ?? "");
}

/**
 * Read one writer's letters from a Project Gutenberg edition of letters:
 * each letter a section under its part and year, titled by its number and
 * dateline, as printed with emphasis marked, cited by edition and page. The
 * editors' preface, introductions, notes and Project Gutenberg's own text
 * are left out.
 */
export function parseGutenbergLetters(
  html: string,
  edition: GutenbergLetters,
): BookUnit[] {
  const window = new Window();
  try {
    const document = new window.DOMParser().parseFromString(html, "text/html");
    const reading: Reading = {
      page: { page: 0, label: "", anchor: "" },
      part: null,
      year: null,
      letter: null,
      letters: [],
    };
    visit(document.body, reading);
    const sections = reading.letters
      .filter((letter) => isWriters(letter, edition.writer))
      .map((letter) => letter.section);
    const page = `https://www.gutenberg.org/cache/epub/${edition.ebook}/pg${edition.ebook}-images.html`;
    return unitsOfSections(sections, (start) => ({
      citation: `${edition.citation}, ${start.label}`,
      source: `${page}#${start.anchor}`,
    }));
  } finally {
    // Closing only releases the window's timers; parsing is already done.
    void window.happyDOM.close();
  }
}
