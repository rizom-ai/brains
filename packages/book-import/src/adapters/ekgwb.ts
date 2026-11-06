import { Window, type Element, type Node } from "happy-dom";
import type { BookUnit } from "../render-book";
import { TEXT_NODE, escapeMarkdown } from "./markup";

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

function headingsOf(element: Element): string[] {
  return Array.from(element.children)
    .filter((child) => HEADING.test(child.tagName))
    .map(labelText);
}

/** Escape markdown characters in every text node, so the text stays text. */
function escapeText(node: Node): void {
  if (node.nodeType === TEXT_NODE) {
    node.textContent = escapeMarkdown(node.textContent);
    return;
  }
  Array.from(node.childNodes).forEach(escapeText);
}

/** The text below a node, in reading order. */
function textNodesOf(node: Node): Node[] {
  return node.nodeType === TEXT_NODE
    ? [node]
    : Array.from(node.childNodes).flatMap(textNodesOf);
}

/**
 * Emphasised spans that touch are one emphasis, as when a word is split or an
 * editor's correction wraps part of it: no text lies between them in reading
 * order, whatever elements enclose them. Later spans fold into earlier ones,
 * so a run of touching spans becomes the first.
 */
function mergeTouchingEmphasis(copy: Element): void {
  const owners = textNodesOf(copy)
    .filter((text) => text.textContent.length > 0)
    .map((text) => text.parentElement?.closest("span.bold") ?? null);
  owners
    .slice(0, -1)
    .map((owner, index) => [owner, owners[index + 1] ?? null] as const)
    .reverse()
    .forEach(([span, next]) => {
      if (span && next && span !== next) {
        span.textContent = span.textContent + next.textContent;
        next.textContent = "";
      }
    });
}

/**
 * Spaced emphasis on the page becomes markdown emphasis, its text escaped.
 * Space at a span's edges stays outside the markers, between the words.
 */
function markEmphasis(copy: Element): void {
  escapeText(copy);
  mergeTouchingEmphasis(copy);
  copy.querySelectorAll("span.bold").forEach((span) => {
    const text = span.textContent;
    const word = text.trim();
    if (word.length === 0) return;
    const lead = text.slice(0, text.length - text.trimStart().length);
    const trail = text.slice(text.trimEnd().length);
    span.textContent = `${lead}*${normalise(word)}*${trail}`;
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
  const heading = headingsOf(parent)[0];
  return heading ? [...above, heading] : above;
}

/** A section block as read, before its part is known. */
interface RawUnit {
  section: string;
  headings: string[];
  /** Headings of the siglum blocks that enclose it, where the page nests. */
  wrappers: string[];
  paragraphs: string[];
}

function rawUnitOf(block: Element): RawUnit | null {
  const paragraphs = Array.from(block.children)
    .filter(isParagraph)
    .map(paragraphText)
    .filter((text) => text.length > 0);
  const headings = headingsOf(block);
  // Heading-only blocks still name parts, though they are no section.
  if (paragraphs.length === 0 && headings.length === 0) return null;
  return {
    section: block.id.replace(/^eKGWB\//, ""),
    headings,
    wrappers: parentsOf(block),
    paragraphs,
  };
}

/** A siglum without its last segment names the part: FW-II-57 is in FW-II. */
function partKeyOf(section: string): string {
  const cut = section.lastIndexOf("-");
  return cut < 0 ? section : section.slice(0, cut);
}

const UMLAUTS: Record<string, string> = {
  ä: "ae",
  ö: "oe",
  ü: "ue",
  Ä: "Ae",
  Ö: "Oe",
  Ü: "Ue",
};

/** Sigla spell a word either way: GD-Irrthuemer-1 and GD-Irrthümer-2 share a part. */
function spelledKey(key: string | null): string | null {
  return key?.replace(/[äöüÄÖÜ]/g, (ch) => UMLAUTS[ch] ?? ch) ?? null;
}

function sameKey(left: string | null, right: string | null): boolean {
  return spelledKey(left) === spelledKey(right);
}

/**
 * A block of headings alone names the part its siglum opens: GT-Selbstkritik
 * is "Versuch einer Selbstkritik", MA-II-VM[Titel] "Vermischte Meinungen und
 * Sprüche". The book's own title block names no part.
 */
function partNamesOf(
  raws: RawUnit[],
  bookSiglum: string | null,
): Map<string, string> {
  return new Map(
    raws.flatMap((raw): [string, string][] => {
      const name = raw.headings.at(-1);
      const key = spelledKey(raw.section.replace(/-?\[Titel\]$/, ""));
      if (raw.paragraphs.length > 0 || name === undefined || key === null) {
        return [];
      }
      return sameKey(key, bookSiglum) ? [] : [[key, name]];
    }),
  );
}

/** The last segment of a siglum: 57 in FW-II-57. */
function lastSegmentOf(section: string): string {
  return section.slice(section.lastIndexOf("-") + 1);
}

/** A bracketed last segment names a block rather than numbering it: [Motto]. */
function bracketOf(section: string): string | null {
  return /\[([^\]]+)\]$/.exec(section)?.[1] ?? null;
}

/** The edition repeats a heading in brackets where its chapter goes on. */
function plainHeading(heading: string): string {
  return heading.replace(/^\[(.*)\]$/, "$1").replace(/\.$/, "");
}

const NUMBER = /^\d+$/;
/** Books numbered in their sigla: M-I to M-V. */
const ROMAN = /^[IVXLC]+$/;

/**
 * Most pages do not nest sections in their parts; a part shows where a block
 * opens with a part heading above its own, where a block's only heading names
 * the part its siglum opens (a motto, or the titled first section of a
 * chapter), or where the siglum numbers a book. A section's title is its
 * block's last heading, or its number where its heading names its chapter.
 */
function withParts(raws: RawUnit[], bookSiglum: string | null): BookUnit[] {
  const names = partNamesOf(raws, bookSiglum);
  return raws.reduce<{
    units: BookUnit[];
    key: string | null;
    part: string | null;
    /** Whether the part's sections are numbered or titled, as its first is. */
    numbered: boolean;
  }>(
    (state, raw) => {
      const key = partKeyOf(raw.section);
      const ownKey = !sameKey(key, bookSiglum);
      const keyChanged = !sameKey(key, state.key);
      const leading = raw.headings.length > 1 ? raw.headings[0] : undefined;
      const only = raw.headings.length === 1 ? raw.headings[0] : undefined;
      const bracket = bracketOf(raw.section);
      const number = lastSegmentOf(raw.section);
      // Nested blocks take their parts from the blocks around them.
      const opening =
        raw.wrappers.length === 0 && keyChanged && ownKey && only !== undefined;
      // A block whose only heading names the part it opens, as a motto does.
      const namesPart = opening && bracket !== null;
      // A chapter's first section, titled by its chapter: GD-Irrthuemer-1.
      const opensChapter =
        opening &&
        bracket === null &&
        NUMBER.test(number) &&
        !NUMBER.test(only);
      const continues =
        leading !== undefined &&
        state.part !== null &&
        plainHeading(leading) === plainHeading(state.part);
      // A titled block at the book's own level ends a part of numbered
      // sections; a part opened above a titled block goes on through them.
      const standsAlone =
        !ownKey && only !== undefined && !NUMBER.test(only) && state.numbered;
      const segment = lastSegmentOf(key);
      const named = names.get(spelledKey(key) ?? "");
      const part = continues
        ? state.part
        : (leading ??
          (namesPart || opensChapter
            ? only
            : keyChanged
              ? ownKey
                ? (named ?? (ROMAN.test(segment) ? segment : null))
                : null
              : standsAlone
                ? null
                : state.part));
      const title = namesPart
        ? bracket
        : opensChapter
          ? number
          : (raw.headings.at(-1) ?? raw.section);
      const unit: BookUnit = {
        parents:
          raw.wrappers.length > 0 ? raw.wrappers : part !== null ? [part] : [],
        title,
        section: raw.section,
        page: null,
        source: `${EKGWB_BASE}${raw.section}`,
        paragraphs: raw.paragraphs,
      };
      const numbered =
        part === state.part ? state.numbered : NUMBER.test(title);
      return { units: [...state.units, unit], key, part, numbered };
    },
    { units: [], key: null, part: null, numbered: false },
  ).units;
}

/**
 * The page writes empty anchors XML-style (`<a name="…"/>`); HTML reads that
 * as an anchor left open, which swallows the section that follows.
 */
function closeEmptyAnchors(html: string): string {
  return html.replace(/<a ([^>]*?)\s*\/>/g, "<a $1></a>");
}

/**
 * Parse an eKGWB print page into the book's title and units, in reading
 * order. The book's siglum tells a book's own sections from its parts; the
 * page's title block supplies it when the caller does not.
 */
export function parseEkgwbBook(html: string, siglum?: string): EkgwbBook {
  const window = new Window();
  try {
    const document = window.document;
    document.write(closeEmptyAnchors(html));

    const titleHeading =
      document.querySelector(".titel h1") ?? document.querySelector("h1");
    const blocks = Array.from(document.querySelectorAll("div")).filter(
      isSiglumBlock,
    );
    const titleBlock = blocks.find((block) => block.id.endsWith("-[Titel]"));
    const bookSiglum =
      siglum ??
      (titleBlock
        ? titleBlock.id.replace(/^eKGWB\//, "").replace(/-\[Titel\]$/, "")
        : null);
    // The title page opens the book and belongs to no part.
    const titlePage = titleBlock ? rawUnitOf(titleBlock) : null;
    const units = [
      ...(titlePage
        ? [
            {
              parents: [],
              title: bracketOf(titlePage.section) ?? titlePage.section,
              section: titlePage.section,
              page: null,
              source: `${EKGWB_BASE}${titlePage.section}`,
              paragraphs: titlePage.paragraphs,
            },
          ]
        : []),
      ...withParts(
        blocks
          .filter((block) => block !== titleBlock)
          .map(rawUnitOf)
          .filter((unit): unit is RawUnit => unit !== null),
        bookSiglum,
      ),
    ].filter((unit) => unit.paragraphs.length > 0);

    return {
      title: titleHeading ? labelText(titleHeading) : "",
      units,
    };
  } finally {
    // Closing only releases the window's timers; parsing is already done.
    void window.happyDOM.close();
  }
}
