import { Window, type Element, type Node } from "happy-dom";
import type { BookUnit } from "../render-book";
import {
  currentSection,
  unitsOfSections,
  type TitledSection,
} from "../sections";
import {
  TEXT_NODE,
  emphasised,
  escapeMarkdown,
  isElement,
  mergedEmphasis,
  nameOf,
  titleCased,
} from "./markup";

/** A work of the Marx-Engels-Werke as mlwerke.de published it, page by page. */
export interface MlwerkeWork {
  /** How a citation names the work before its MEW page: Manuskripte 1844, 471. */
  citation: string;
  /** The transcription's slips, each fixed on its MEW page as the text reads. */
  fixes?: MlwerkeFix[];
}

export interface MlwerkeFix {
  page: string;
  from: string;
  to: string;
}

/** One of the work's pages on mlwerke.de, as fetched. */
export interface MlwerkePage {
  url: string;
  html: string;
}

/** A paragraph or note, where its text starts. */
interface Block {
  text: string;
  /** Pages in reading order. */
  page: number;
  /** The MEW page as printed. */
  label: string;
  url: string;
}

interface Place {
  page: number;
  label: string;
}

interface Reading {
  place: Place;
  url: string;
  sections: Array<TitledSection<Block>>;
  /** The part a heading of the second level stands under. */
  part: { node: object; title: string } | null;
  /** Marx's and Engels's notes, by their mark, with the page that marks them. */
  kept: Map<string, Place>;
}

/** The site's navigation and the editors' title lines, never the text. */
const APPARATUS =
  "table, hr, h1, h2, p.link, p.toplink, p.updat, p.info, p.toc, script, style";
/** Elements whose text is the author's emphasis. */
const EMPHASIS = new Set(["em", "i", "strong", "b"]);
/** A heading that opens the notes of a page: Fußnoten, Redaktionelle Fußnoten, Anmerkungen. */
const NOTES_HEADING =
  /^(?:Redaktionelle\s+)?(?:Fu(?:ß|ss)noten?|Anmerkungen?|Bemerkungen?)\b/i;
/** Notes the authors wrote, not the editors: Fußnoten von Marx. */
const AUTHORS_NOTES = /\bvon\s+(?:Marx|Engels)\b/i;
/** A MEW page number set in the text: <471>. */
const PAGE_MARK = /<(\d+)>/g;
/** The editors' words before a note Marx set without a reference. */
const LEAD_IN = /^[^:]*\bohne Verweis die Bemerkung:\s*/;
/**
 * Windows' punctuation, which the pages give as numeric references that
 * HTML maps to C1 controls: &#150; is a dash.
 */
const WINDOWS_PUNCTUATION: Record<string, string> = {
  "\u0084": "„",
  "\u0085": "…",
  "\u0091": "‘",
  "\u0092": "’",
  "\u0093": "“",
  "\u0094": "”",
  "\u0096": "–",
  "\u0097": "—",
};

function punctuated(text: string): string {
  return text.replace(
    /[\u0084\u0085\u0091-\u0094\u0096\u0097]/g,
    (character) => WINDOWS_PUNCTUATION[character] ?? character,
  );
}

/** Straight quotation marks as German ones: "so" is „so“. */
function germanQuotes(text: string): string {
  return text.replace(/(^|[\s([—–])"|"/g, (_mark, before?: string) =>
    before === undefined ? "“" : `${before}„`,
  );
}

function turnPage(reading: Reading, label: string): void {
  if (reading.place.label === label) return;
  reading.place = { page: reading.place.page + 1, label };
}

/** A note's mark from its reference: [A] in the text points to note A. */
function referencedNote(element: Element): string | null {
  const href = element.getAttribute("href") ?? "";
  return href.startsWith("#n") ? href.slice(2) : null;
}

/**
 * A text's words as read: MEW's page numbers turn the page, angle brackets
 * mark a passage struck out in the manuscript, the rest escaped as Markdown.
 */
function textOf(raw: string, reading: Reading): string {
  const parts = punctuated(raw).split(PAGE_MARK);
  return parts
    .map((part, index) => {
      if (index % 2 === 1) {
        turnPage(reading, part);
        return "";
      }
      return escapeMarkdown(part.replace(/</g, "⟨").replace(/>/g, "⟩"));
    })
    .join("");
}

/** An element's text as read: the authors' note marks kept, the editors' left out. */
function inlineText(node: Node, reading: Reading): string {
  if (node.nodeType === TEXT_NODE) return textOf(node.textContent, reading);
  if (!isElement(node)) return "";
  const name = nameOf(node);
  if (name === "br") return " ";
  if (name === "a") {
    const mark = referencedNote(node);
    if (mark !== null) {
      if (!reading.kept.has(mark)) return "";
      reading.kept.set(mark, reading.place);
      return `${escapeMarkdown(mark)})`;
    }
  }
  const inner = Array.from(node.childNodes)
    .map((child) => inlineText(child, reading))
    .join("");
  return EMPHASIS.has(name) ? emphasised(inner) : inner;
}

function spaced(text: string): string {
  return germanQuotes(
    mergedEmphasis(text)
      .replace(/\s+/g, " ")
      .replace(/\s+([,.;:!?)])/g, "$1")
      .trim(),
  );
}

/** A paragraph cited from the page it starts on, a page number opening it included. */
function addParagraph(element: Element, reading: Reading): void {
  const opening = /^\s*<(\d+)>/.exec(element.textContent);
  if (opening?.[1]) turnPage(reading, opening[1]);
  const place = reading.place;
  const text = spaced(inlineText(element, reading).replace(/^\s*/, ""));
  if (text.length === 0) return;
  currentSection(reading.sections).paragraphs.push({
    text,
    ...place,
    url: reading.url,
  });
}

function addHeading(element: Element, reading: Reading): void {
  const title = titleCased(spaced(element.textContent));
  if (title.length === 0) return;
  if (nameOf(element) === "h4") {
    reading.part = { node: element, title };
    reading.sections.push({
      path: [element],
      titles: [title],
      paragraphs: [],
      notes: [],
    });
    return;
  }
  const part = reading.part;
  reading.sections.push({
    path: part ? [part.node, element] : [element],
    titles: part ? [part.title, title] : [title],
    paragraphs: [],
    notes: [],
  });
}

/** A note of the authors', with its mark, placed on the page that marks it. */
function addNote(element: Element, reading: Reading): void {
  const anchor = element.querySelector("a[name^='n']");
  const mark = anchor?.getAttribute("name")?.slice(1) ?? "";
  anchor?.remove();
  const text = spaced(inlineText(element, reading)).replace(LEAD_IN, "");
  if (text.length === 0) return;
  const place = reading.kept.get(mark) ?? reading.place;
  currentSection(reading.sections).notes.push({
    text: mark ? `${escapeMarkdown(mark)}) ${text}` : text,
    ...place,
    url: reading.url,
  });
}

/**
 * Whose notes a heading opens: the authors', the editors', or none, the
 * heading being the text's. Some pages set it as a paragraph of its own.
 */
function notesOpened(element: Element): "authors" | "editors" | null {
  const name = nameOf(element);
  const title = element.textContent.trim();
  const heading =
    name === "h3" ||
    name === "h4" ||
    (name === "p" && !element.classList.contains("note") && title.length < 60);
  if (!heading || !NOTES_HEADING.test(title)) return null;
  return AUTHORS_NOTES.test(title) ? "authors" : "editors";
}

/** The marks of a page's notes by Marx or Engels, read before its text. */
function authorsMarks(body: Element): string[] {
  const { marks } = Array.from(body.children).reduce<{
    authors: boolean;
    marks: string[];
  }>(
    (state, element) => {
      const opened = notesOpened(element);
      if (opened) return { ...state, authors: opened === "authors" };
      const name = nameOf(element);
      if (name === "h3" || name === "h4") return { ...state, authors: false };
      const mark = element
        .querySelector("a[name^='n']")
        ?.getAttribute("name")
        ?.slice(1);
      return state.authors && mark
        ? { ...state, marks: [...state.marks, mark] }
        : state;
    },
    { authors: false, marks: [] },
  );
  return marks;
}

/** Read one page into the reading: headings, paragraphs, the authors' notes. */
function readPage(page: MlwerkePage, reading: Reading): void {
  const window = new Window();
  try {
    const document = window.document;
    document.body.innerHTML = page.html;
    document.querySelectorAll(APPARATUS).forEach((element) => {
      element.remove();
    });
    reading.url = page.url;
    reading.kept = new Map(
      authorsMarks(document.body).map((mark) => [mark, reading.place]),
    );
    Array.from(document.body.children).reduce<"text" | "authors" | "editors">(
      (region, element) => {
        const opened = notesOpened(element);
        if (opened) return opened;
        const name = nameOf(element);
        if (name === "h3" || name === "h4") {
          if (region !== "text") return "editors";
          addHeading(element, reading);
          return "text";
        }
        if (name !== "p") return region;
        if (region === "authors") addNote(element, reading);
        // A note out of its list is still the editors'.
        if (region === "text" && !element.classList.contains("note")) {
          addParagraph(element, reading);
        }
        return region;
      },
      "text",
    );
  } finally {
    // Closing only releases the window's timers; parsing is already done.
    void window.happyDOM.close();
  }
}

/** Fix a slip in the first paragraph or note of its page that has it. */
function applyFix(
  sections: Array<TitledSection<Block>>,
  fix: MlwerkeFix,
): void {
  const block = sections
    .flatMap((section) => [...section.paragraphs, ...section.notes])
    .find((each) => each.label === fix.page && each.text.includes(fix.from));
  if (!block) {
    throw new Error(`No "${fix.from}" on MEW page ${fix.page} to fix`);
  }
  block.text = block.text.replace(fix.from, fix.to);
}

/**
 * Read a work of the Marx-Engels-Werke from its pages on mlwerke.de: each
 * heading opens a section, under the part a manuscript or book heading opens;
 * paragraphs as MEW prints them, cited by work and MEW page. Marx's and
 * Engels's own notes are kept; the editors' notes, introductions and the
 * site's navigation are left out.
 */
export function parseMlwerkePages(
  pages: MlwerkePage[],
  work: MlwerkeWork,
): BookUnit[] {
  const reading: Reading = {
    place: { page: 0, label: "" },
    url: "",
    sections: [],
    part: null,
    kept: new Map(),
  };
  pages.forEach((page) => readPage(page, reading));
  (work.fixes ?? []).forEach((fix) => applyFix(reading.sections, fix));
  return unitsOfSections(reading.sections, (start) => ({
    citation: `${work.citation}, ${start.label}`,
    source: start.url,
  }));
}
