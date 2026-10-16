import { Window, type Element, type Node } from "happy-dom";
import { sameName } from "./archive-ocr-headings";
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
  /**
   * The work's headings in order, where its pages set them only as centred
   * lines among others that are text; every other centred line is text.
   * None listed, the pages' markup tells the headings.
   */
  headings?: MlwerkeHeading[];
  /** Each page is an article of a volume, titled by the page's first-level heading. */
  articles?: boolean | undefined;
  /** Sections to leave out by their headings, with what stands under them: another author's article. */
  skipHeadings?: string[] | undefined;
}

export interface MlwerkeHeading {
  /** 1 for the outermost. */
  level: number;
  title: string;
  /**
   * The line or lines the heading stands as, by how each begins; the title
   * if none; an empty list for a heading the pages leave out, opened where
   * the next one stands.
   */
  match?: string[] | undefined;
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
  /** The headings the text now stands under, outermost first. */
  open: Array<{ node: object; title: string; level: number }>;
  /** A listed work's headings, the next one to find and how much of it is found. */
  listed: { headings: MlwerkeHeading[]; next: number; line: number } | null;
  /** Marx's and Engels's notes, by their anchor: the mark, and the page and section that mark them. */
  kept: Map<
    string,
    { mark: string; place: Place; section?: TitledSection<Block> }
  >;
  /** Every note's anchor on the page, the editors' included. */
  notes: Set<string>;
  /** Levels the page's own headings stand below: one under an article's title. */
  depth: number;
}

/** The site's navigation and the editors' title line, never the text. */
const APPARATUS =
  "table, hr, h1, p.link, p.toplink, p.updat, p.info, p.toc, script, style";
/** Elements whose text is the author's emphasis. */
const EMPHASIS = new Set(["em", "i", "strong", "b", "u"]);
/**
 * A heading or line that only names the authors, above the work's title,
 * some bracketed or after a stray bracket: [Karl Marx], Karl Marx; Friedrich Engels.
 */
const AUTHOR_LINE =
  /^[<⟨]?\[?(?:Karl Marx|Friedrich Engels)(?:\s*[-–/;]\s*(?:Karl Marx|Friedrich Engels))?\]?$/;
/** A line that names the authors and then the article: Karl Marx [Erklärung]. */
const BYLINE_TITLE =
  /^\*?(?:Karl Marx|Friedrich Engels)(?:\s*[-–/]\s*(?:Karl Marx|Friedrich Engels))?\s+(.+?)\*?$/;
/** A MEW page number the older pages set in bold between bars, some starred: |203|, |204|*. */
const BARRED_PAGE = /^\s*\|(\d+)\|\*?\s*$/;
/** The same opening a bold run, the text set with it following. */
const BARRED_OPENING = /^\s*\|(\d+)\|\*?/;
/** Where the older pages' template holds the text itself. */
const TEXT_REGION =
  /<!-- #BeginEditable "Textk[^"]*" -->([\s\S]*?)<!-- #EndEditable -->/;
/** A heading that opens the notes of a page: Fußnoten, Redaktionelle Fußnoten, Anmerkungen. */
const NOTES_HEADING =
  /^(?:Redaktionelle\s+)?(?:Fu(?:ß|ss)noten?|Anmerkungen?|Bemerkungen?)\b/i;
/**
 * The same set as a paragraph of its own; Anmerkung alone stays text, for
 * Marx quotes Hegel's paragraphs and their Anmerkungen.
 */
const NOTES_PARAGRAPH =
  /^(?:Redaktionelle\s+\S+|Fu(?:ß|ss)noten?\b|Textvarianten\b)/i;
/** Notes the authors wrote, not the editors: Fußnoten von (Karl) Marx. */
const AUTHORS_NOTES = /\bvon\s+(?:(?:Karl|Friedrich)\s+)?(?:Marx|Engels)\b/i;
/** A note's mark as a link shows it: [7*], [20], (1), {1}, A. */
const NOTE_MARK = /^\s*[[({]?[\p{L}\d]{1,3}\*?[\])}]?\.?\s*$/u;
/** A link to the page that gathers a volume's editors' notes: me03_anm.htm#M3. */
const EDITORS_NOTES_PAGE = /_anm\.htm#/i;
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

/** Straight quotation marks as German ones: "so" is „so“, *"so"* is *„so“*. */
function germanQuotes(text: string): string {
  return text.replace(
    /(^|[\s([—–])(\**)"|"/g,
    (_mark, before?: string, emphasis?: string) =>
      before === undefined ? "“" : `${before}${emphasis ?? ""}„`,
  );
}

function turnPage(reading: Reading, label: string): void {
  if (reading.place.label === label) return;
  reading.place = { page: reading.place.page + 1, label };
}

/** The anchor a link points to on its own page: #F1 is F1. */
function linkedAnchor(element: Element): string | null {
  const href = element.getAttribute("href") ?? "";
  return href.startsWith("#") ? href.slice(1) : null;
}

/** A note's own anchor and the mark it shows: A., (1). */
function noteAnchor(
  element: Element,
): { anchor: Element; id: string; mark: string } | null {
  const anchor = element.querySelector("a[name]");
  const id = anchor?.getAttribute("name");
  if (!anchor || !id) return null;
  return { anchor, id, mark: anchor.textContent.replace(/[().\s]/g, "") };
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
  const barred = BARRED_OPENING.exec(node.textContent);
  if (barred?.[1] && (name === "strong" || name === "b")) {
    // The bold sets off the page number; text set with it is plain text.
    turnPage(reading, barred[1]);
    return textOf(node.textContent.slice(barred[0].length), reading);
  }
  if (name === "a") {
    // A link back from a note to its mark.
    if (node.textContent.trim() === "<=") return "";
    const id = linkedAnchor(node);
    const kept = id === null ? undefined : reading.kept.get(id);
    if (id !== null && kept) {
      reading.kept.set(id, {
        ...kept,
        place: reading.place,
        section: currentSection(reading.sections),
      });
      return `${escapeMarkdown(kept.mark)})`;
    }
    // An editors' note's mark, its note on this page, on the volume's page
    // of notes or not given; a link to a place in the text, such as p. [31],
    // stays text.
    if (
      EDITORS_NOTES_PAGE.test(node.getAttribute("href") ?? "") ||
      (id !== null &&
        (reading.notes.has(id) || NOTE_MARK.test(node.textContent)))
    ) {
      return "";
    }
  }
  const inner = Array.from(node.childNodes)
    .map((child) => inlineText(child, reading))
    .join("");
  return EMPHASIS.has(name) ? emphasised(inner) : inner;
}

/**
 * A run between bars, as the older pages set the editors' glosses and a
 * manuscript's numbers alike: |Zuhörerschaft|, |II|.
 */
const BARRED_RUN = /\|(\*?\p{L}(?:[^|\n]{0,60}?[^\s|])?)\|/gu;

/** The editors' glosses in MEW's angle brackets, as the newer pages give them; a manuscript's numbers, in capitals, stay barred. */
function angledGlosses(text: string): string {
  return text.replace(BARRED_RUN, (run, inner: string) =>
    /\p{Ll}/u.test(inner) ? `⟨${inner}⟩` : run,
  );
}

function spaced(text: string): string {
  return germanQuotes(
    angledGlosses(mergedEmphasis(text))
      .replace(/\s+/g, " ")
      .replace(/\s+([,.;:!?)])/g, "$1")
      .trim(),
  );
}

/** A paragraph cited from the page it starts on, a page number opening it included. */
function addParagraph(element: Element, reading: Reading): void {
  const first = Array.from(element.children).at(0);
  const opening =
    /^\s*<(\d+)>/.exec(element.textContent)?.[1] ??
    (first &&
    element.textContent.trimStart().startsWith(first.textContent.trim())
      ? BARRED_PAGE.exec(first.textContent)?.[1]
      : undefined);
  if (opening) turnPage(reading, opening);
  const place = reading.place;
  const text = spaced(inlineText(element, reading).replace(/^\s*/, ""));
  if (text.length === 0) return;
  const paragraphs = currentSection(reading.sections).paragraphs;
  const last = paragraphs.at(-1);
  // A paragraph the transcription broke off at a page number inside a
  // word runs on into the next.
  if (
    last &&
    last.page < place.page &&
    /\p{L}-$/u.test(last.text) &&
    /^\p{Ll}/u.test(text)
  ) {
    last.text = SET_APART.test(text)
      ? `${last.text} ${text}`
      : `${last.text.slice(0, -1)}${text}`;
    return;
  }
  paragraphs.push({
    text,
    ...place,
    url: reading.url,
  });
}

/** Open a heading at its level, closing those at its level and below. */
function openHeading(level: number, title: string, reading: Reading): void {
  reading.open = [
    ...reading.open.filter((heading) => heading.level < level),
    { node: {}, title, level },
  ];
  reading.sections.push({
    path: reading.open.map((heading) => heading.node),
    titles: reading.open.map((heading) => heading.title),
    paragraphs: [],
    notes: [],
  });
}

function addHeading(
  element: Element,
  kind: "part" | "section",
  reading: Reading,
): void {
  const title = titleCased(spaced(element.textContent));
  if (title.length === 0) return;
  openHeading((kind === "part" ? 1 : 2) + reading.depth, title, reading);
}

/** A line's words as it reads, its line breaks as spaces. */
function lineText(node: Node): string {
  if (node.nodeType === TEXT_NODE) return punctuated(node.textContent);
  if (!isElement(node)) return "";
  if (nameOf(node) === "br") return " ";
  return Array.from(node.childNodes).map(lineText).join("");
}

/**
 * Open the listed headings a line stands as, in order, one line holding
 * several or one heading spanning lines; whether it stood as any.
 */
function openListed(element: Element, reading: Reading): boolean {
  const listed = reading.listed;
  if (!listed) return false;
  // Headings the pages leave out stand before the next one they have.
  const nextStanding = (index: number): number => {
    const heading = listed.headings[index];
    return heading?.match?.length === 0 ? nextStanding(index + 1) : index;
  };
  const take = (rest: string, found: boolean): boolean => {
    const standing = nextStanding(listed.next);
    const heading = listed.headings[standing];
    if (!heading || rest.length === 0) return found;
    const lines = heading.match ?? [heading.title];
    const line = lines[listed.line] ?? "";
    if (line.length === 0 || !rest.startsWith(line)) return found;
    if (listed.line === 0) {
      listed.headings
        .slice(listed.next, standing)
        .forEach((left) => openHeading(left.level, left.title, reading));
      listed.next = standing;
    }
    listed.line += 1;
    if (listed.line === lines.length) {
      openHeading(heading.level, heading.title, reading);
      listed.next = standing + 1;
      listed.line = 0;
    }
    return take(rest.slice(line.length).trim(), true);
  };
  return take(lineText(element).replace(/\s+/g, " ").trim(), false);
}

/** A line set at the centre, where a listed work's headings stand. */
function isCentred(element: Element): boolean {
  return (element.getAttribute("align") ?? "").toLowerCase() === "center";
}

/** A note of the authors', with its mark, placed on the page that marks it. */
function addNote(element: Element, reading: Reading): void {
  const own = noteAnchor(element);
  own?.anchor.remove();
  const mark = own?.mark ?? "";
  const text = spaced(inlineText(element, reading)).replace(LEAD_IN, "");
  if (text.length === 0) return;
  const marked = own ? reading.kept.get(own.id) : undefined;
  const place = marked?.place ?? reading.place;
  // A note goes with the section that marks it, not the page's last.
  (marked?.section ?? currentSection(reading.sections)).notes.push({
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
    ((name === "h3" || name === "h4") && NOTES_HEADING.test(title)) ||
    (name === "p" &&
      !element.classList.contains("note") &&
      title.length < 60 &&
      NOTES_PARAGRAPH.test(title));
  if (!heading) return null;
  return AUTHORS_NOTES.test(title) ? "authors" : "editors";
}

/** The page's blocks of text and its headings, in reading order. */
function blocksOf(body: Element): Element[] {
  return Array.from(body.querySelectorAll("h2, h3, h4, p"));
}

/** What a heading opens: a part (a manuscript, a book), a section, or nothing. */
function headingKind(element: Element): "part" | "section" | null {
  const name = nameOf(element);
  if (name === "h2" || name === "h4") return "part";
  if (name === "h3") return "section";
  return null;
}

/**
 * The editors' lines above a work the oldest pages set as text: when it was
 * written, and where it appeared, bracketed.
 */
const EDITORS_HEADER = /^(?:Geschrieben\s.{0,150}\d{4}\.?|\[[^\]]*\d{4}\.?\])$/;

/**
 * The editors' lines a page sets above the text, before its first page
 * number: when and how the work appeared, where it is printed from, the
 * newspaper bracketed or quoted, the authors' names.
 */
const EDITORS_LINES: RegExp[] = [
  AUTHOR_LINE,
  /^(?:Geschrieben|Erschienen|Gedruckt|Zuerst veröffentlicht|Zum erstenmal veröffentlicht)\s/,
  /^(?:Aus|Nach):\s/,
  /^Nach der Handschrift\.?$/,
  /^Nach de[mr]\s.{0,60}(?:Flugblatt|Handschrift|Manuskript|Ausgabe)\.?$/,
  /^\[[^\]]*\d{4}[^\]]*\]$/,
  /^["„][^"“]{3,100}["“],\s.{0,100}\d{4}\.?$/,
  // The Revue's title, which some pages break across two lines.
  /^["„]Neue Rheinische Zeitung\.$/,
  /^Politisch-ökonomische Revue["“],\s.{0,60}\d{4}\.?$/,
];

function isEditorsLine(element: Element): boolean {
  const text = lineText(element).replace(/\s+/g, " ").trim();
  return (
    headingKind(element) === null &&
    EDITORS_LINES.some((line) => line.test(text))
  );
}

/** A word that keeps the hyphen before it: Kauf- und Verkauf. */
const SET_APART = /^(?:und|oder|bis|sowie)(?![\p{L}-])/u;

/** The site's line above a page's text naming the author and the work: Friedrich Engels - Herrn Eugen Dühring's Umwälzung der Wissenschaft. */
const SITE_TITLE =
  /^(?:Karl Marx|Friedrich Engels)(?:\s*\/\s*(?:Karl Marx|Friedrich Engels))?\s+-\s+\S/;

/** A page number set in the text: <471>, |203|. */
const MARKED_PAGE = /<(\d+)>|\|(\d+)\|/;

/** The blocks after the editors' lines above the page's first page number. */
function withoutEditorsLines(blocks: Element[]): Element[] {
  const marked = blocks.findIndex((block) =>
    MARKED_PAGE.test(block.textContent),
  );
  // A page with no page number has them only above its first line of text.
  const text = blocks.findIndex(
    (block) => headingKind(block) === null && !isEditorsLine(block),
  );
  const opening = marked === -1 ? text : marked;
  return blocks.filter(
    (block, index) => index >= opening || !isEditorsLine(block),
  );
}

/** The first MEW page the page's header names: S. 625, S. 148-151. */
function headerPage(html: string): string | undefined {
  const text = html.replace(/<!--[\s\S]*?-->/g, "").replace(/<[^>]*>/g, " ");
  return /Seitenzahlen verweisen auf:[\s\S]{0,600}?\bS\.\s*(\d+)/.exec(
    text,
  )?.[1];
}

/**
 * The oldest pages' own apparatus set as text: the edition the page numbers
 * follow, the transcription's date, the editors' header, the site's path
 * to the volume and the links to the work's other pages.
 */
function isSiteApparatus(element: Element): boolean {
  const text = element.textContent.trim();
  if (
    (headingKind(element) !== null && SITE_TITLE.test(text)) ||
    /^(?:Seitenzahlen verweisen auf|Pfad:|\d+\.\s*Korrektur|Erstellt am|Karl Marx\s*[-/]\s*Friedrich Engels\s*-\s*Werke\b)/.test(
      text,
    ) ||
    EDITORS_HEADER.test(text)
  ) {
    return true;
  }
  const links = Array.from(element.querySelectorAll("a[href]")).filter(
    (link) => linkedAnchor(link) === null,
  );
  if (links.length === 0) return false;
  const words = (of: string): string => of.replace(/\s+/g, " ").trim();
  const rest = links.reduce(
    (left, link) => left.replace(words(link.textContent), ""),
    words(text),
  );
  return /^[\s|–-]*$/.test(rest);
}

/** Where a block stands: in the text, among the authors' notes, or the editors'. */
type Region = "text" | "authors" | "editors";

/** The page's notes, by their anchors: the authors' with their marks, and all. */
function notesOf(blocks: Element[]): {
  kept: Array<[string, string]>;
  all: string[];
} {
  return blocks.reduce<{
    region: Region;
    kept: Array<[string, string]>;
    all: string[];
  }>(
    (state, element) => {
      const opened = notesOpened(element);
      if (opened) return { ...state, region: opened };
      if (headingKind(element)) return { ...state, region: "editors" };
      if (state.region === "text") return state;
      const own = noteAnchor(element);
      if (!own) return state;
      return {
        ...state,
        kept:
          state.region === "authors"
            ? [...state.kept, [own.id, own.mark]]
            : state.kept,
        all: [...state.all, own.id],
      };
    },
    { region: "text", kept: [], all: [] },
  );
}

/**
 * The oldest pages' markup made sound: a stray bracket before a name set as
 * text, which HTML would read as a tag; a heading set in large type made a
 * heading, the type sizes dropped, and a heading the page closes as a
 * paragraph closed; bold or emphasis opened before a
 * paragraph moved into it, which would otherwise close the paragraph at its
 * page number and leave the text after it out; a note's mark nested in the
 * link to its note, which HTML cannot nest, set as the link.
 */
function sound(html: string): string {
  return html
    .replace(/<(?=[A-ZÄÖÜ][a-zäöüß]+\s+[A-ZÄÖÜ][a-zäöüß]+[^>=]*>)/g, "&lt;")
    .replace(
      /<FONT SIZE="?(?:\+[2-9]|[5-9])"?>\s*<P(?:\s+ALIGN="?CENTER"?)?>([\s\S]*?)<\/P>/gi,
      "<H3>$1</H3>",
    )
    .replace(/<\/?FONT[^>]*>/gi, "")
    .replace(
      /<(H[1-6])([^>]*)>((?:(?!<\/?H[1-6][\s>]|<P[\s>])[\s\S])*?)<\/P>/gi,
      "<$1$2>$3</$1>",
    )
    .replace(/<(B|EM|I|STRONG|U)>(\s*)<P([^>]*)>/gi, "<P$3>$2<$1>")
    .replace(
      /<A\s+HREF="(#[^"]*)"\s*>\s*<A\s+NAME="[^"]*"\s*>([^<]*)<\/A>\s*<\/A>/gi,
      '<A HREF="$1">$2</A>',
    );
}

/** Read one page into the reading: headings, paragraphs, the authors' notes. */
function readPage(
  page: MlwerkePage,
  reading: Reading,
  work: MlwerkeWork,
): void {
  const window = new Window();
  try {
    const document = window.document;
    const region = TEXT_REGION.exec(page.html)?.[1];
    // The older template sets an article's title above its text region.
    const above = (): string => {
      if (region === undefined || work.articles !== true) return "";
      document.body.innerHTML = sound(page.html);
      return document.querySelector("h1")?.textContent ?? "";
    };
    const outside = above();
    document.body.innerHTML = sound(region ?? page.html);
    // An article's title, which the apparatus would take for the site's.
    const headed =
      work.articles === true
        ? titleCased(
            spaced(document.querySelector("h1")?.textContent ?? outside),
          )
        : "";
    document.querySelectorAll(APPARATUS).forEach((element) => {
      element.remove();
    });
    const listed = withoutEditorsLines(
      blocksOf(document.body).filter((element) => !isSiteApparatus(element)),
    );
    // Some pages set an article's title in one line with its authors' names.
    const byline =
      work.articles === true && headed === ""
        ? listed
            .slice(0, 3)
            .find((element) => BYLINE_TITLE.test(spaced(element.textContent)))
        : undefined;
    // Others set it as the first heading above the text, in large type.
    const marked = listed.findIndex((element) =>
      MARKED_PAGE.test(element.textContent),
    );
    const opening =
      work.articles === true && headed === "" && byline === undefined
        ? listed
            .slice(0, marked === -1 ? listed.length : marked)
            .find(
              (element) =>
                headingKind(element) !== null &&
                !AUTHOR_LINE.test(element.textContent.trim()),
            )
        : undefined;
    const titling = byline ?? opening;
    const article =
      titling === undefined
        ? headed
        : titleCased(
            spaced(titling.textContent).replace(BYLINE_TITLE, "$1").trim(),
          );
    const blocks = listed.filter((element) => element !== titling);
    const notes = notesOf(blocks);
    reading.url = page.url;
    // Text before a page's first number, such as a chapter's motto, is on
    // that page.
    const first = MARKED_PAGE.exec(
      blocks.map((block) => block.textContent).join(" "),
    );
    // A page with no page number of its own is on the page its header
    // names, if it opens an article or the work.
    const label =
      first?.[1] ??
      first?.[2] ??
      (work.articles === true || reading.place.label === ""
        ? headerPage(page.html)
        : undefined);
    if (label) turnPage(reading, label);
    if (article.length > 0) openHeading(1, article, reading);
    reading.kept = new Map(
      notes.kept.map(([id, mark]) => [id, { mark, place: reading.place }]),
    );
    reading.notes = new Set(notes.all);
    blocks.reduce<Region>((region, element) => {
      const opened = notesOpened(element);
      if (opened) return opened;
      const kind = headingKind(element);
      if (kind && AUTHOR_LINE.test(element.textContent.trim())) return region;
      if (reading.listed) {
        if ((kind || isCentred(element)) && openListed(element, reading)) {
          return "text";
        }
        if (region === "text") addParagraph(element, reading);
        if (region === "authors") addNote(element, reading);
        return region;
      }
      if (kind) {
        if (region !== "text") return "editors";
        addHeading(element, kind, reading);
        return "text";
      }
      if (region === "authors") addNote(element, reading);
      // A note out of its list is still the editors'.
      if (region === "text" && !element.classList.contains("note")) {
        addParagraph(element, reading);
      }
      return region;
    }, "text");
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
    open: [],
    listed: work.headings?.length
      ? { headings: work.headings, next: 0, line: 0 }
      : null,
    kept: new Map(),
    notes: new Set(),
    depth: work.articles === true ? 1 : 0,
  };
  pages.forEach((page) => {
    readPage(page, reading, work);
  });
  const missing = reading.listed?.headings[reading.listed.next];
  if (missing) {
    throw new Error(`No heading "${missing.title}" in the pages, in its order`);
  }
  (work.fixes ?? []).forEach((fix) => applyFix(reading.sections, fix));
  const skipped = (section: TitledSection<Block>): boolean =>
    section.titles.some((title) =>
      (work.skipHeadings ?? []).some((heading) => sameName(title, heading)),
    );
  // A paragraph or note a fix empties is left out.
  const kept = reading.sections
    .filter((section) => !skipped(section))
    .map((section) => ({
      ...section,
      paragraphs: section.paragraphs.filter((block) => block.text !== ""),
      notes: section.notes.filter((block) => block.text !== ""),
    }));
  return unitsOfSections(kept, (start) => ({
    citation: `${work.citation}, ${start.label}`,
    source: start.url,
  }));
}
