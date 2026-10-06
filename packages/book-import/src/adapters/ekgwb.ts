import { Window, type Element } from "happy-dom";
import type { BookUnit } from "../render-book";

/** Every eKGWB unit is addressed by its siglum below this base. */
export const EKGWB_BASE = "http://www.nietzschesource.org/eKGWB/";

export interface EkgwbBook {
  title: string;
  units: BookUnit[];
}

const HEADING = /^H[1-6]$/;
/** Editors' notes, footnotes and links that only exist on the page. */
const APPARATUS = ".popup, .footnotes, .no_print";

/** Sections and the parts containing them carry their siglum as their id. */
function isSiglumBlock(element: Element): boolean {
  return element.tagName === "DIV" && element.id.startsWith("eKGWB/");
}

function isStanza(element: Element): boolean {
  return element.tagName === "DIV" && element.className === "lg";
}

function isParagraph(element: Element): boolean {
  return (
    (element.tagName === "DIV" && element.className === "p") ||
    element.tagName === "P" ||
    isStanza(element)
  );
}

function normalise(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

/** A copy without apparatus, its line breaks read as spaces. */
function cleanCopy(element: Element): Element {
  const copy = element.cloneNode(true);
  copy.querySelectorAll(APPARATUS).forEach((node) => node.remove());
  copy.querySelectorAll("br").forEach((br) => br.replaceWith(" "));
  return copy;
}

/** Headings end in a full stop on the page; the label does not need it. */
function labelText(element: Element): string {
  return normalise(cleanCopy(element).textContent).replace(/\.$/, "");
}

function headingOf(element: Element): string | null {
  const heading = Array.from(element.children).find((child) =>
    HEADING.test(child.tagName),
  );
  return heading ? labelText(heading) : null;
}

/**
 * The author's text of one paragraph: apparatus removed, the edition's
 * corrected readings kept, spaced emphasis as markdown emphasis.
 */
/** Spaced emphasis on the page becomes markdown emphasis. */
function markEmphasis(copy: Element): void {
  copy.querySelectorAll("span.bold").forEach((span) => {
    span.textContent = `*${normalise(span.textContent)}*`;
  });
}

function blockText(block: Element): string {
  const copy = cleanCopy(block);
  markEmphasis(copy);
  return normalise(copy.textContent);
}

/** Marks where a verse line ends; never occurs in the page's text. */
const LINE_END = "\u2028";

/**
 * A stanza keeps its lines, as markdown hard breaks. Lines can hold further
 * lines, so every line ends where its element does, at any depth.
 */
function stanzaText(stanza: Element): string {
  const copy = cleanCopy(stanza);
  markEmphasis(copy);
  copy.querySelectorAll("div.l").forEach((line) => line.after(LINE_END));
  return copy.textContent
    .split(LINE_END)
    .map(normalise)
    .filter((line) => line.length > 0)
    .join("  \n");
}

function paragraphText(paragraph: Element): string {
  return isStanza(paragraph) ? stanzaText(paragraph) : blockText(paragraph);
}

function parentsOf(element: Element): string[] {
  const parent = element.parentElement;
  if (!parent) return [];
  const above = parentsOf(parent);
  if (!isSiglumBlock(parent)) return above;
  const heading = headingOf(parent);
  return heading ? [...above, heading] : above;
}

function unitOf(block: Element): BookUnit | null {
  const paragraphs = Array.from(block.children)
    .filter(isParagraph)
    .map(paragraphText)
    .filter((text) => text.length > 0);
  if (paragraphs.length === 0) return null;

  const section = block.id.replace(/^eKGWB\//, "");
  return {
    parents: parentsOf(block),
    title: headingOf(block) ?? section,
    section,
    page: null,
    source: `${EKGWB_BASE}${section}`,
    paragraphs,
  };
}

/**
 * The page writes empty anchors XML-style (`<a name="…"/>`); HTML reads that
 * as an anchor left open, which swallows the section that follows.
 */
function closeEmptyAnchors(html: string): string {
  return html.replace(/<a ([^>]*?)\s*\/>/g, "<a $1></a>");
}

/** Parse an eKGWB print page into the book's title and units, in reading order. */
export function parseEkgwbBook(html: string): EkgwbBook {
  const window = new Window();
  try {
    const document = window.document;
    document.write(closeEmptyAnchors(html));

    const titleHeading =
      document.querySelector(".titel h1") ?? document.querySelector("h1");
    const units = Array.from(document.querySelectorAll("div"))
      .filter(isSiglumBlock)
      .map(unitOf)
      .filter((unit): unit is BookUnit => unit !== null);

    return {
      title: titleHeading ? labelText(titleHeading) : "",
      units,
    };
  } finally {
    // Closing only releases the window's timers; parsing is already done.
    void window.happyDOM.close();
  }
}
