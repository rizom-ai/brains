import { Window } from "happy-dom";
import type { BookUnit } from "../render-book";
import { unitsOfSections } from "../sections";
import { closedBrackets } from "./brackets";
import { sharpened, unjoined } from "./run-together";
import {
  createSpelling,
  headingLineOf,
  headingOf,
  SECTION_NAME,
  isWordy,
  namesTitle,
  retitled,
  sameName,
  type Spelling,
  type Heading,
  type HeadingLevel,
  type HeadingLine,
} from "./archive-ocr-headings";
import { tableCells, tabled } from "./tables";

/** A misread line fixed: on a printed page, its text from, as the reader reads it, to the right one. */
export interface OcrCorrection {
  page: number | string;
  from: string;
  to: string;
}

/** A work inside a scanned volume, by its printed pages. */
export interface ArchiveOcrWork {
  /** The archive.org item, e.g. `freud-1940-gw-13`, or the name of a scan another library holds. */
  item: string;
  /** A scan another library holds: its page images, in the scan's order. */
  scan?: { pages: string[] } | undefined;
  /** The work's title, which its opening heading may print. */
  title: string;
  /** How a citation names the volume before its page: GW XIII. */
  citation: string;
  /** A printed page, or a roman page of the front matter. */
  firstPage: number | string;
  lastPage: number | string;
  /** Pages in the range that are not the author's, such as an editors' note. */
  skipPages?: number[];
  /** Sections to leave out by their headings, such as a piece in another language. */
  skipHeadings?: string[];
  /** The number of the work's first chapter, where it goes on from another. */
  firstChapter?: number;
  /** Lines the OCR misread, fixed. */
  corrections?: OcrCorrection[];
  /** Notes not the author's, such as an editor's, by page and opening words. */
  skipNotes?: PageLine[];
  /**
   * Headings set in the text's type, by the line that opens them: one named
   * with its level is that heading, its label as printed or none; otherwise
   * a numbered or lettered one keeps its label, one without opens a chapter
   * numbered by place; a section's numeral the scan lost stands above it.
   */
  headings?: Array<PageLine & HeadingOpening>;
  /**
   * Pages the OCR read too askew to tell paragraphs by their indent: on each,
   * the lines that open one, by their opening words; no other line there
   * opens one.
   */
  paragraphs?: PageLine[];
  /**
   * Pages whose notes the OCR set as the text, too close below it to tell:
   * on each, the lines that open a note, by their opening words; no other
   * line there opens one. A line that runs on the note of the page before,
   * where the reader takes it for text, is named too, as running on.
   */
  notes?: Array<PageLine & { runsOn?: boolean | undefined }>;
  /**
   * An editor's signatures (K.): the notes ending in one are the editor's,
   * and so are paragraphs ending in one, notes the page set as text.
   */
  skipNotesSigned?: string[];
  /**
   * The edition sets its notes as large as the text, below a rule the OCR
   * does not read; full lines below a gap in the page's lower half are notes.
   */
  spacedNotes?: boolean;
  /**
   * The scan's lines curve, so their starts tell no indent: a paragraph
   * opens only below a line that ends a sentence, where that line stops
   * short of the measure or the line below it is set in.
   */
  curved?: boolean;
  /** The edition glosses its paragraphs in the margin, which the text leaves out. */
  marginalia?: boolean;
  /**
   * A volume of newspaper articles: each article is titled above its
   * dateline (London, 9. Juni 1854), a series' parts numbered there, and
   * articles stand under topics set in display type.
   */
  datelined?: boolean;
  /**
   * The line its first page opens the work with, where it follows another
   * work's end on that page, as a periodical prints it.
   */
  opensWith?: string | undefined;
}

/** What the manifest says of a heading set in the text's type. */
interface HeadingOpening {
  /** The numeral the scan lost above the line. */
  numeral?: string | undefined;
  /** Its level: 0 a part, 1 a chapter, 2 its sections, 3 and 4 below them. */
  level?: HeadingLevel | undefined;
  /** Its label as printed, without the stop after it; none where it prints none. */
  label?: string | undefined;
}

/** A note left out: on a printed page, the note that opens with these words. */
/** A line on a printed page, by the words it opens with. */
export interface PageLine {
  page: number | string;
  opens: string;
}

interface Line {
  x: number;
  y: number;
  bottom: number;
  width: number;
  size: number;
  text: string;
  /** A title set on its numeral's line: the heading ends with it. */
  ends?: boolean;
  /** Read from a line of numeral and title, which no running head is. */
  numbered?: boolean;
  /** Set by a correction: read by eye, its words are the work's. */
  corrected?: boolean;
  /** Where each of its words starts, as the OCR placed them. */
  starts?: number[];
}

interface Page {
  /** The scan leaf, as archive.org numbers its pages. */
  leaf: number;
  /** The printed number the scan's reading gives the page, where it gives one. */
  pageno: number | null;
  width: number;
  height: number;
  lines: Line[];
}

const LINE_SELECTOR = ".ocr_line, .ocr_header, .ocr_caption, .ocr_textfloat";

/** Footnotes are set smaller than the text, at most this share of its size. */
const NOTE_SIZE = 0.8;
/**
 * No type is set this small: a short line the OCR measures so is a rule or
 * an ornament read as scraps, at most this share of the text's size. A full
 * line measured so is text on a curved page.
 */
const MARK_SIZE = 0.4;
/** The notes below a rule are set smaller than the text, at most this share. */
const FOOT_TEXT_SIZE = 0.9;
/** Running heads sit in the top tenth of the page, */
const HEAD_ZONE = 0.1;
/** A head carrying its page's number may stand this low, where the scan sets the page lower. */
const LOW_HEAD_ZONE = 0.12;
/** among its first lines, below at most a scrap or two of the scan's noise. */
const HEAD_LINES = 3;
/** A first line indented by more than this share of the page opens a paragraph. */
const INDENT = 0.02;
/** A centred heading's middle sits this close to the page's middle. */
const CENTRE = 0.08;
/** A heading line is narrower than this share of the text column, */
const HEADING_WIDTH = 0.9;
/** or set at least this much larger than the text, as a part's title is. */
const HEADING_SIZE = 1.25;
/**
 * Display type, a title in Fraktur, is set half again as large as the text
 * and stands taller than the page's lines; the OCR overstates now a line's
 * type size, now its height, but not both.
 */
const DISPLAY_SIZE = 1.5;
const DISPLAY_HEIGHT = 1.4;
/** A title the OCR misread is at most this share of the text column. */
const TITLE_WIDTH = 0.75;
/** So many tokens without a word among them are scraps, not a short last line. */
const SCRAP_TOKENS = 3;
/** A citation's token: an abbreviation, a numeral or a page number, with its brackets. */
const CITATION_TOKEN =
  /^[([„“]*(?:\p{L}{1,2}\.|[IVXLC]+\.?|\d+(?:[.,—–-]\d+)*[.,;:]?)[)\]“”.,;:]*$/u;

/** A note's mark opening its line: a superscript figure, bracketed or not, or a figure or asterisks before a bracket. */
const LEADING_NOTE_MARK = /^(?:[¹²³⁴⁵⁶⁷⁸⁹⁰]+\)?|ı\)|\d{1,2}\)|\*+\))\s+/u;

/**
 * A citation set alone, all abbreviations and numbers: (l. c. S. 114, 115.),
 * or a note that only refers back, after its mark: ¹ l. c.; ² A. a. O. A
 * number without an abbreviation is a margin's page number.
 */
function isCitation(text: string): boolean {
  const marked = LEADING_NOTE_MARK.test(text);
  const rest = text.replace(LEADING_NOTE_MARK, "");
  return (
    (marked || /\d/.test(rest)) &&
    /(?<![\p{L}\d])\p{L}{1,2}\./u.test(rest) &&
    rest.split(" ").every((token) => CITATION_TOKEN.test(token))
  );
}

/**
 * A token that reads as a word: a roman numeral or an abbreviation (USW.),
 * or three letters running,
 * a small one among them or four capitals; one letter over and over (EEE)
 * is a rule the OCR read as letters.
 */
function isWordToken(token: string): boolean {
  const run = token.match(/\p{L}{3,}/u)?.[0];
  if (run === undefined) return false;
  if (/^[IVXLCDM]+$/u.test(run) || /^\p{L}+\.$/u.test(token)) return true;
  return (
    !/^(\p{L})\1*$/iu.test(run) && (/\p{Ll}/u.test(run) || run.length >= 4)
  );
}

/** A line without a word, and no citation: a mark on the scan. */
function isWordless(text: string): boolean {
  return !text.split(/\s+/u).some(isWordToken) && !isCitation(text);
}

/** A line of several tokens and no word among them: a rule read as letters. */
function isScraps(text: string): boolean {
  return isWordless(text) && text.split(" ").length >= SCRAP_TOKENS;
}

/** A word the text uses this often is one of its common words. */
const COMMON_USES = 3;

/** A page whose lines are mostly not words holds a picture, not text. */
const CLEAN_LINES = 0.5;

/**
 * A page number opening or closing the line, past a scrap of OCR noise, or
 * standing alone, between dashes at most.
 */
const RUNNING_HEAD =
  /^(?:\S{1,2}\s+)?(\d+)\s+\S.*$|^.*\S\s+(\d+)(?:\s+\S{1,2})?$|^[—–-]?\s*(\d+)\s*[—–-]?$/;
/**
 * The printer's signature at a sheet's foot: the volume by its authors'
 * names, a comma after the first or more names after it, and numeral
 * (Freud, XIII; Marx, Engels, Lassalle. II; Marx-Engels' Schriften. II;
 * Freud's with its sheet number read as a scrap: Freud, XI. ß),
 * the sheet's number after it, the
 * numeral and the number however misread. A single word with a stop and a stray mark
 * (Gesetz. |) is a line's end.
 */
const SIGNATURE =
  /^(?:\p{Lu}\s+)?Freud\s*[,.]?\s*[IVXLlx1|J\]EitU]{1,5}\.?[,.]?\s*\S{0,3}\s*$|^(?:Freud\s*[,.]?|\p{Lu}\p{L}*\s*,(?:\s*\p{Lu}\p{L}*\s*[,.]){0,3}|\p{Lu}\p{L}*\s*\.(?:\s*\p{Lu}\p{L}*\s*[,.]){1,3}|\p{Lu}[\p{L}'’-]*-[\p{L}'’-]+\s+\p{Lu}\p{L}*\s*\.)\s*[IVXLl1|J]+\.?[,.]?\s*[\dIl|]*\s*$/u;
const NOTE_START = /^(?:ı|\d+|\*+)\)/;
/** A note marked by asterisks: *) or **). */
const STAR_NOTE_START = /^\*+\)/;
/** A note's mark, its digit read as ½ or lost: ½) 1 Frank ist 8 Sgr. */
const MARKED_NOTE_START = /^(?:[ı½¹²³]|\d{1,2})?\)\s/u;
/** The OCR reads the superscript note marker 1) as a dotless i. */
const OCR_NOTE_MARKER = /ı\)|(?<![\p{L}\d])\\\)/gu;

/** Share of a line's height a piece must overlap to stand on that line. */
const SAME_LINE = 0.3;

/**
 * The OCR sometimes splits one printed line into pieces, and where the page
 * curves a piece sits lower than its line; read in order of height, a piece
 * right of the line before that overlaps it in height is that line.
 */
function joinSplitLines(lines: Line[]): Line[] {
  return [...lines]
    .sort((a, b) => a.y - b.y || a.x - b.x)
    .reduce<Line[]>((joined, line) => {
      const last = joined.at(-1);
      if (
        last &&
        line.x > last.x + last.width &&
        line.y < last.bottom - (last.bottom - last.y) * SAME_LINE
      ) {
        return [
          ...joined.slice(0, -1),
          {
            ...last,
            width: line.x + line.width - last.x,
            bottom: Math.max(last.bottom, line.bottom),
            text: `${last.text} ${line.text}`,
            starts: [...(last.starts ?? []), ...(line.starts ?? [])],
          },
        ];
      }
      return [...joined, line];
    }, []);
}

/**
 * A rule: a line without letters, or one set as small as no type is, its
 * dashes read with a letter or two among them.
 */
function isRule(line: Line, bodySize: number): boolean {
  const signs = line.text.match(/[\p{L}\d]/gu) ?? [];
  const dashes = line.text.match(/[—–-]/gu) ?? [];
  return (
    // A rule runs across the line; a speck of a mark stands no wider than tall.
    (signs.length === 0 && line.width > line.bottom - line.y) ||
    (line.size < bodySize * MARK_SIZE && dashes.length > signs.length * 2)
  );
}

/** Letters mostly in capitals, off the centre: the facing page's edge. */
/**
 * A line's text with the bars the OCR read made what they stand for: an l
 * before „. c.“ (l. c.), a 1 opening figures (1905), else a speck at the
 * line's edge, between words or inside one.
 */
function withoutBars(text: string): string {
  return text
    .replace(/(?<![\p{L}\d])\|[.,]\s?c\./gu, "l. c.")
    .replace(/(?<![\p{L}\d|])\|(?=\d{2,})/gu, "1")
    .replace(/(?<=\p{L})\|(?=\p{Ll})/gu, "")
    .replace(/\s*\|\s*/gu, " ")
    .replace(/\s{2,}/gu, " ")
    .trim();
}

/** A page's lines without the bars the OCR read, but in a table's rows read from the scan; a line of bars alone is gone. */
function debarred(page: Page): Page {
  return {
    ...page,
    lines: page.lines.flatMap((line) => {
      if (isTableRow(line) || !line.text.includes("|")) return [line];
      const text = withoutBars(line.text);
      return text === "" ? [] : [{ ...line, text }];
    }),
  };
}

/** A table's row read from the scan, its cells parted by bars. */
function isTableRow(line: Line): boolean {
  return line.corrected === true && /\s\|\s|^\[?\p{L}*\]? \|/u.test(line.text);
}

function isEdgeNoise(text: string): boolean {
  const letters = text.match(/\p{L}/gu) ?? [];
  const capitals = text.match(/\p{Lu}/gu) ?? [];
  return letters.length >= 6 && capitals.length / letters.length > 0.6;
}

const ROMAN: ReadonlyArray<readonly [number, string]> = [
  [50, "L"],
  [40, "XL"],
  [10, "X"],
  [9, "IX"],
  [5, "V"],
  [4, "IV"],
  [1, "I"],
];

function roman(value: number): string {
  return ROMAN.reduce(
    ({ rest, text }, [size, numeral]) => ({
      rest: rest % size,
      text: text + numeral.repeat(Math.floor(rest / size)),
    }),
    { rest: value, text: "" },
  ).text;
}

const ROMAN_VALUES: Record<string, number> = { I: 1, V: 5, X: 10, L: 50 };

/** A roman numeral's value: a smaller numeral before a larger subtracts. */
function romanValue(numeral: string): number {
  const values = [...numeral].map((letter) => ROMAN_VALUES[letter] ?? 0);
  return values.reduce(
    (sum, value, index) =>
      sum + (value < (values[index + 1] ?? 0) ? -value : value),
    0,
  );
}

function numbers(title: string, key: string): number[] {
  const match = new RegExp(`${key} ([\\d. -]+)`).exec(title);
  return match?.[1] ? match[1].trim().split(/\s+/).map(Number) : [];
}

/** A word as the hOCR gives it: its text and its box. */
interface ReadWord {
  textContent: string;
  getAttribute(name: string): string | null;
}

/** A scan's edge: this share of its width from either side. */
const SCAN_EDGE = 0.01;

/**
 * The page edge's shadow, read as a glyph: a line's first or last word, of
 * one letter or figure at most, touching the scan's edge beside the line's
 * other words.
 */
function isEdgeShadow(
  word: ReadWord,
  index: number,
  words: ReadWord[],
  width: number,
): boolean {
  if (words.length < 2) return false;
  if (index !== 0 && index !== words.length - 1) return false;
  if (!/^[^\s\p{L}\d]*[\p{L}\d]?[^\s\p{L}\d]*$/u.test(word.textContent.trim()))
    return false;
  const [left = 0, , right = 0] = numbers(
    word.getAttribute("title") ?? "",
    "bbox",
  );
  return index === 0
    ? left <= width * SCAN_EDGE
    : right >= width * (1 - SCAN_EDGE);
}

/** The scan's pages, each with its lines, position and type size. */
function readPages(hocr: string): Page[] {
  const window = new Window();
  try {
    const document = window.document;
    return hocr
      .split(/(?=<div class=['"]ocr_page['"])/)
      .slice(1)
      .map((chunk) => {
        document.body.innerHTML = chunk;
        const page = document.querySelector(".ocr_page");
        const [, , width = 1, height = 1] = numbers(
          page?.getAttribute("title") ?? "",
          "bbox",
        );
        const lines = joinSplitLines(
          Array.from(document.querySelectorAll(LINE_SELECTOR))
            .map((element) => {
              const title = element.getAttribute("title") ?? "";
              const [x0 = 0, y0 = 0, x1 = 0, y1 = 0] = numbers(title, "bbox");
              const read = Array.from(element.querySelectorAll(".ocrx_word"));
              const kept = read.filter(
                (word, index) => !isEdgeShadow(word, index, read, width),
              );
              // A stray mark beside the line would move its edges; its words
              // of letters and digits place it.
              const words = kept
                .filter((word) => /[\p{L}\d]/u.test(word.textContent))
                .map((word) =>
                  numbers(word.getAttribute("title") ?? "", "bbox"),
                );
              const left = Math.min(...words.map(([x = x0]) => x), x1);
              const right = Math.max(...words.map(([, , x = x1]) => x), x0);
              const placed = words.length > 0 && right > left;
              return {
                x: placed ? left : x0,
                y: y0,
                bottom: y1,
                width: placed ? right - left : x1 - x0,
                size: numbers(title, "x_size")[0] ?? 0,
                starts: kept
                  .filter((word) => word.textContent.trim() !== "")
                  .map(
                    (word) =>
                      numbers(word.getAttribute("title") ?? "", "bbox")[0] ??
                      x0,
                  ),
                text: (kept.length < read.length
                  ? kept.map((word) => word.textContent).join(" ")
                  : element.textContent
                )
                  .replace(/\s+/g, " ")
                  .trim(),
              };
            })
            .filter((line) => line.text.length > 0),
        );
        const pageno = Number.parseInt(
          document.querySelector(".ocr_pageno")?.textContent ?? "",
          10,
        );
        return {
          leaf: Number(/(\d+)$/.exec(page?.id ?? "")?.[1] ?? Number.NaN),
          pageno: Number.isNaN(pageno) ? null : pageno,
          width,
          height,
          lines,
        };
      });
  } finally {
    // Closing only releases the window's timers; parsing is already done.
    void window.happyDOM.close();
  }
}

/** A page scanned at another size than the volume's: by half again or more. */
const OTHER_SCALE = 1.5;

/**
 * The volume's pages at one scale: a leaf scanned at another size than most
 * is measured as if scanned at theirs.
 */
function atOneScale(pages: Page[]): Page[] {
  const width = median(pages.map((page) => page.width));
  return pages.map((page) => {
    const factor = width / page.width;
    if (factor < OTHER_SCALE && 1 / factor < OTHER_SCALE) return page;
    const scaled = (value: number): number => Math.round(value * factor);
    return {
      ...page,
      width: scaled(page.width),
      height: scaled(page.height),
      lines: page.lines.map((line) => ({
        ...line,
        x: scaled(line.x),
        y: scaled(line.y),
        bottom: scaled(line.bottom),
        width: scaled(line.width),
        size: line.size * factor,
        ...(line.starts ? { starts: line.starts.map(scaled) } : {}),
      })),
    };
  });
}

/**
 * The volume's pages without the margin a scan keeps above the type, where
 * even its pages set highest have nothing in their head zone: measured from
 * the top of their lines, their running heads stand where a page's do. A
 * chapter's opening page sets its first line lower; the lowest quarter of
 * the pages' tops passes over them.
 */
function withoutTopMargin(pages: Page[]): Page[] {
  const tops = pages
    .flatMap((page) =>
      page.lines.length > 0
        ? [Math.min(...page.lines.map((line) => line.y)) / page.height]
        : [],
    )
    .sort((a, b) => a - b);
  const top = tops[Math.floor(tops.length / 4)] ?? 0;
  if (top <= HEAD_ZONE) return pages;
  const margin = top - HEAD_ZONE / 2;
  return pages.map((page) => {
    const cut = Math.round(margin * page.height);
    return {
      ...page,
      height: page.height - cut,
      lines: page.lines.map((line) => ({
        ...line,
        y: line.y - cut,
        bottom: line.bottom - cut,
      })),
    };
  });
}

/** The page number a line carries as a running head, if it reads as one. */
function headNumber(text: string): number | null {
  // The OCR reads a 1 in a page number as a dotless i, and may set a digit
  // of it in superscript.
  const match = RUNNING_HEAD.exec(
    text
      .replace(/(?<=\d)ı|ı(?=\d)/g, "1")
      .replace(/(?<=\d)[⁰¹²³⁴⁵⁶⁷⁸⁹]/gu, (digit) =>
        String("⁰¹²³⁴⁵⁶⁷⁸⁹".indexOf(digit)),
      ),
  );
  const number = match?.[1] ?? match?.[2] ?? match?.[3];
  return number === undefined ? null : Number(number);
}

/** The page's running head that carries its page number, and where it stands. */
function numberedHead(page: Page): { index: number; number: number } | null {
  return page.lines.reduce<{ index: number; number: number } | null>(
    (found, line, index) => {
      if (found || index >= HEAD_LINES || line.y > page.height * HEAD_ZONE) {
        return found;
      }
      const number = headNumber(line.text);
      return number === null ? null : { index, number };
    },
    null,
  );
}

/**
 * Where a running head stands that the scan set below the head zone, or -1:
 * a first line carrying the page's own number, which the text's never does.
 */
function lowHeadIndex(page: Page, number: number | null): number {
  if (number === null) return -1;
  return page.lines.findIndex(
    (line, index) =>
      index < HEAD_LINES &&
      line.y <= page.height * LOW_HEAD_ZONE &&
      headNumber(line.text) === number,
  );
}

/** A front-matter head: a roman page number at its start or end. */
const ROMAN_HEAD = /^([IVXL]+)\s+\S.*$|^.*\S\s+([IVXL]+)$/;
/** A roman page number alone, which only the front matter's head is. */
const LONE_ROMAN_HEAD = /^[—–-]?\s*([IVXL]+)\s*[—–-]?$/;

/** The roman page number of a front-matter page's running head. */
function romanHead(
  page: Page,
  front = false,
): { index: number; number: number } | null {
  return page.lines.reduce<{ index: number; number: number } | null>(
    (found, line, index) => {
      if (found || index >= HEAD_LINES || line.y > page.height * HEAD_ZONE) {
        return found;
      }
      const match =
        ROMAN_HEAD.exec(line.text) ??
        (front ? LONE_ROMAN_HEAD.exec(line.text) : null);
      const numeral = match?.[1] ?? match?.[2];
      return numeral === undefined
        ? null
        : { index, number: romanValue(numeral) };
    },
    null,
  );
}

/**
 * The offset from scan leaf to roman page in the front matter, the one most
 * of its roman heads agree on, or null where there are none.
 */
function romanOffset(pages: Page[]): number | null {
  const counts = pages.reduce<Map<number, number>>((tally, page) => {
    const head = romanHead(page, true);
    if (!head) return tally;
    const offset = head.number - page.leaf;
    return tally.set(offset, (tally.get(offset) ?? 0) + 1);
  }, new Map());
  return [...counts].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
}

function runningHeadNumber(page: Page): number | null {
  return page.pageno ?? numberedHead(page)?.number ?? null;
}

/** Words of a running head, by which a head that lost its number is known. */
function headWords(text: string): string[] {
  return (text.match(/\p{L}{4,}/gu) ?? []).map((word) => word.toLowerCase());
}

/** A head shares this share of its words with a numbered head. */
const HEAD_LIKENESS = 0.6;

/**
 * Where the running head stands on a page, or -1: the line with the page
 * number, or else a line in the head zone worded like a numbered head of the
 * volume, whose number the OCR lost.
 */
function runningHeadIndex(
  page: Page,
  heads: Array<Set<string>>,
  front = false,
): number {
  const numbered = numberedHead(page) ?? romanHead(page, front);
  // The OCR may read a head as two lines, its number above its title; the
  // head ends with the later of them. A numbered section's heading below the
  // numbered head shares the head's words, not its place.
  const titled = titledHeadIndex(page, heads);
  const sectionBelow =
    numbered !== null &&
    titled > numbered.index &&
    NUMBERED_SUBSECTION.test(page.lines[titled]?.text ?? "");
  return Math.max(numbered?.index ?? -1, sectionBelow ? -1 : titled);
}

/** The line that reads as one of the volume's running titles, if any. */
function titledHeadIndex(page: Page, heads: Array<Set<string>>): number {
  return page.lines.findIndex((line, index) => {
    if (index >= HEAD_LINES || line.y > page.height * HEAD_ZONE) return false;
    const words = headWords(line.text);
    return (
      words.length >= 2 &&
      heads.some(
        (head) =>
          words.filter((word) => head.has(word)).length / words.length >=
          HEAD_LIKENESS,
      )
    );
  });
}

/** What numbering a scan leaf needs: its running head's number, if any, and how much it reads. */
export interface LeafReading {
  leaf: number;
  head: number | null;
  /** The scan's reading states the page's number, which needs no other head to agree. */
  stated?: boolean;
  /** Words of running text; a plate's picture reads as next to none. */
  words: number;
  /** Scanned across, wider than tall: a folded table's part or a plate set sideways, no page. */
  across?: boolean;
}

/** A running head's number counts when a head this close by agrees with it. */
const CONFIRM_LEAVES = 4;

interface Anchor {
  leaf: number;
  offset: number;
}

/** A scan missing a leaf or two raises the offset that much. */
const MISSING_LEAVES = 2;
/**
 * Plates bound in one place lower the offset by this many leaves, whatever
 * the leaves between read as; more, only where so many leaves between read
 * as plates.
 */
const PLATE_LEAVES = 8;
/** A leaf reading fewer words than this is a plate's picture, a blank or a title alone. */
const PLATE_WORDS = 10;

/** Whether a leaf reads as no page of text: scanned across, or next to no words. */
function readsAsPlate(reading: LeafReading): boolean {
  return reading.across === true || reading.words < PLATE_WORDS;
}

/** Anchors in runs of one offset, in reading order. */
function runsOf(anchors: Anchor[]): Anchor[][] {
  return anchors.reduce<Anchor[][]>((runs, anchor) => {
    const last = runs.at(-1);
    return last?.[0]?.offset === anchor.offset
      ? [...runs.slice(0, -1), [...last, anchor]]
      : [...runs, [anchor]];
  }, []);
}

/**
 * Whether one run of heads can follow another in the same volume: a missing
 * leaf or two raises the offset, plates lower it, a folded table by as many
 * leaves as it takes, where the leaves between read as plates.
 */
function follows(
  before: Anchor[],
  after: Anchor[],
  readings: LeafReading[],
): boolean {
  const drop = (before[0]?.offset ?? 0) - (after[0]?.offset ?? 0);
  if (drop < -MISSING_LEAVES) return false;
  if (drop <= PLATE_LEAVES) return true;
  const from = before.at(-1)?.leaf ?? 0;
  const to = after[0]?.leaf ?? 0;
  return (
    readings.filter(
      (reading) =>
        reading.leaf > from && reading.leaf < to && readsAsPlate(reading),
    ).length >= drop
  );
}

/** The heaviest chain of runs ending at a run, and the run before it. */
interface Chain {
  weight: number;
  before: number | null;
}

/**
 * Plates lower the offset between leaf and page a few leaves at a time and
 * a missing leaf raises it by one; nothing moves it by a hundred. Of the
 * runs of running heads, the chain that moves only so keeps the most heads;
 * the rest are the OCR misreading a digit, however many pages it does so.
 */
function withoutMisreadRuns(
  anchors: Anchor[],
  readings: LeafReading[],
): Anchor[] {
  const runs = runsOf(anchors);
  const chains = runs.reduce<Chain[]>((done, run) => {
    const best = done.reduce<Chain>(
      (found, chain, at) =>
        follows(runs[at] ?? [], run, readings) &&
        chain.weight + run.length > found.weight
          ? { weight: chain.weight + run.length, before: at }
          : found,
      { weight: run.length, before: null },
    );
    return [...done, best];
  }, []);
  const last = chains.reduce(
    (top, chain, index) =>
      chain.weight > (chains[top]?.weight ?? -1) ? index : top,
    0,
  );
  const walk = (index: number | null, kept: number[]): number[] =>
    index === null
      ? kept
      : walk(chains[index]?.before ?? null, [index, ...kept]);
  return walk(runs.length > 0 ? last : null, []).flatMap(
    (index) => runs[index] ?? [],
  );
}

/**
 * Number the pages between two anchors whose offsets differ: the plates bound
 * in between take the leaves scanned across, then those that read least, and
 * get no number; the other leaves are numbered on from the first anchor. Of
 * leaves that read alike, the plates are the later: a page's blank back stays
 * beside it, and a fold's back follows the fold.
 */
function numberGap(
  from: Anchor,
  to: Anchor,
  readings: LeafReading[],
): Array<[number, number | null]> {
  const gap = readings.filter(
    (reading) => reading.leaf > from.leaf && reading.leaf < to.leaf,
  );
  const pages = to.leaf + to.offset - (from.leaf + from.offset) - 1;
  // A leaf left out as a rescan of a page holds no plate.
  const plateCount = Math.max(0, gap.length - pages);
  const plates = new Set(
    [...gap]
      .sort(
        (a, b) =>
          Number(b.across === true) - Number(a.across === true) ||
          a.words - b.words ||
          b.leaf - a.leaf,
      )
      .slice(0, plateCount)
      .map((reading) => reading.leaf),
  );
  return gap.reduce<{ numbered: Array<[number, number | null]>; next: number }>(
    ({ numbered, next }, reading) =>
      plates.has(reading.leaf)
        ? { numbered: [...numbered, [reading.leaf, null]], next }
        : { numbered: [...numbered, [reading.leaf, next]], next: next + 1 },
    { numbered: [], next: from.leaf + from.offset + 1 },
  ).numbered;
}

/**
 * Printed page numbers by scan leaf. Running heads anchor the numbering where
 * a nearby head agrees; pages that open a chapter carry none and run on from
 * their neighbours. Plates bound between the pages shift the numbering and
 * get no number themselves.
 */
export function printedPageNumbers(
  readings: LeafReading[],
): Map<number, number | null> {
  const heads = readings.flatMap((reading) =>
    reading.head === null
      ? []
      : [
          {
            leaf: reading.leaf,
            offset: reading.head - reading.leaf,
            stated: reading.stated === true,
          },
        ],
  );
  const anchors = withoutMisreadRuns(
    heads.filter(
      (head) =>
        head.stated ||
        heads.some(
          (other) =>
            other !== head &&
            other.offset === head.offset &&
            Math.abs(other.leaf - head.leaf) <= CONFIRM_LEAVES,
        ),
    ),
    readings,
  );
  const first = anchors[0];
  const last = anchors.at(-1);
  if (!first || !last) {
    return new Map(readings.map((reading) => [reading.leaf, null]));
  }
  const gaps = anchors.slice(1).flatMap((to, index) => {
    const from = anchors[index] ?? to;
    return from.offset === to.offset ? [] : numberGap(from, to, readings);
  });
  const gapPages = new Map(gaps);
  return new Map(
    readings.map((reading): [number, number | null] => {
      const gapPage = gapPages.get(reading.leaf);
      if (gapPage !== undefined) return [reading.leaf, gapPage];
      const before = anchors
        .filter((anchor) => anchor.leaf <= reading.leaf)
        .at(-1);
      return [reading.leaf, reading.leaf + (before ?? first).offset];
    }),
  );
}

/** Words of four or more small letters: running text, not a picture's noise. */
const WORD = /\p{Ll}{4,}/gu;

function readingOf(page: Page): LeafReading {
  return {
    leaf: page.leaf,
    head: runningHeadNumber(page),
    stated: page.pageno !== null,
    words: page.lines.reduce(
      (sum, line) => sum + (line.text.match(WORD)?.length ?? 0),
      0,
    ),
    across: page.width > page.height,
  };
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)] ?? 0;
}

type Piece =
  | {
      kind: "heading";
      lines: HeadingLine[];
      closed?: boolean;
      /** A numbered subsection's, whose title may run on to a second line. */
      subsection?: boolean;
      /**
       * A title too long for its line, which runs on to the next even where
       * that opens like a label: o) Th. Chalmers und einige Anschauungen von /
       * A. Smith.
       */
      runsOn?: boolean;
    }
  | {
      kind: "text";
      text: string;
      opens: boolean;
    }
  | { kind: "note"; text: string; opens: boolean };

/** What reading a page needs to know about its volume. */
interface Volume {
  /** Notes set as large as the text, below a rule the OCR leaves unread. */
  spacedNotes?: boolean;
  /** Lines that curve, their starts no sign of an indent. */
  curved?: boolean;
  /** Newspaper articles, each titled above its dateline. */
  datelined?: boolean;
  /** The page's lines that open a heading set in the text's type, by their opening words. */
  headingOpenings?: Array<{ opens: string } & HeadingOpening>;
  /** The lines that open the page's paragraphs, by their opening words, where the manifest names them. */
  paragraphOpenings?: string[];
  /** The lines that open the page's notes, by their opening words, where the manifest names them. */
  noteOpenings?: string[];
  /** Of the named notes' lines, those that run on the note before rather than open one. */
  noteRunsOn?: string[];
  /** Words of the numbered running heads, which know a head without its number. */
  heads: Array<Set<string>>;
  /** Width of the text column, from the volume's full lines. */
  column: number;
  /** Type size of the text, from the volume's full lines. */
  textSize: number;
  /** The volume's own spelling of its words. */
  spelling: Spelling;
  /** The spelling of its running text alone, without the running heads. */
  textSpelling: Spelling;
  /** The page number printed on each leaf, as the running heads number them. */
  printed: Map<number, number | null>;
  /** The words its text uses often, in small letters. */
  common: Set<string>;
  /** The leaves before its first page: front matter, numbered in roman. */
  frontLeaves: Set<number>;
  /** Whether it sets a chapter's numeral and title on one line, never a numeral alone. */
  numberedTitles: boolean;
}

/** The manifest's word on a heading that opens with this line, if it names one there. */
function headingOpeningOf(
  line: Line,
  volume: Volume,
): ({ opens: string } & HeadingOpening) | undefined {
  return (volume.headingOpenings ?? []).find(
    (opening) =>
      opening.numeral === undefined && line.text.startsWith(opening.opens),
  );
}

/**
 * Where the page's running head stands, or -1: the scan's noise above it
 * goes with it. A heading the manifest names is no running head, however
 * high the page sets it, nor is any line below it; the head that carries
 * the page's number is one, whatever words it repeats.
 */
function headIndex(page: Page, volume: Volume): number {
  const front = volume.frontLeaves.has(page.leaf);
  const low = lowHeadIndex(page, volume.printed.get(page.leaf) ?? null);
  const head = Math.max(runningHeadIndex(page, volume.heads, front), low);
  const numbered = Math.max(
    numberedHead(page)?.index ?? -1,
    romanHead(page, front)?.index ?? -1,
    low,
  );
  const named = page.lines.findIndex(
    (line, index) =>
      index > numbered && headingOpeningOf(line, volume) !== undefined,
  );
  return named >= 0 ? Math.min(head, named - 1) : head;
}

/** Lines below the running head and the scan's noise above it. */
function bodyLines(page: Page, volume: Volume): Line[] {
  return page.lines.slice(headIndex(page, volume) + 1);
}

/** A page's running head as the work's titles may read it: its words, and whether a correction set them. */
interface RunningHead {
  name: string;
  corrected: boolean;
}

/** The running head of a page as read with its corrections, if it has one. */
function runningHeadOf(page: Page, volume: Volume): RunningHead | null {
  const line = page.lines[headIndex(page, volume)];
  return line === undefined
    ? null
    : {
        name: headName(normalised(line.text)),
        corrected: line.corrected === true,
      };
}

/** A token that reads as a word of three letters or more, with its punctuation. */
const WORDLIKE = /^[„“"‚‘'(»«]*\p{L}{3,}[\p{L}-]*[.,;:!?“"'’)»«]*$/u;

/** A line mostly of words, or one a correction read from the scan: text or a heading, not a picture's scraps. */
function isClean(line: Line): boolean {
  const tokens = line.text.split(" ");
  return (
    line.corrected === true ||
    tokens.filter((token) => WORDLIKE.test(token)).length / tokens.length >= 0.5
  );
}

/** A page mostly of scraps: a picture printed among the pages. */
function isPicture(lines: Line[]): boolean {
  return (
    lines.length > 0 &&
    lines.filter(isClean).length / lines.length < CLEAN_LINES
  );
}

/** The OCR reads a note marker, a 1 beside digits, and an i, as a dotless i. */
function normalised(text: string): string {
  return (
    text
      // A dot the OCR set before a word inside the line is a speck.
      .replace(/(?<=\s)\.(?=\p{Ll})/gu, "")
      .replace(OCR_NOTE_MARKER, "¹)")
      // Some scans' OCR prints a line's closing hyphen as ¬.
      .replace(/(?<=\p{L})¬$/u, "-")
      .replace(/(?<=\d)ı|ı(?=\d)/g, "1")
      .replace(/ı/g, "i")
      // A capital umlaut the OCR read twice, small and capital: üÜber.
      .replace(/([äöü])([ÄÖÜ])/gu, (pair, small: string, capital: string) =>
        small.toUpperCase() === capital ? capital : pair,
      )
      // A year of the 1800s or 1900s the OCR read as i, g and o for 1, 9 and 0.
      .replace(/(?<![\p{L}\d])[1i][89g][\dgoi]{2}(?![\p{L}\d])/gu, (year) =>
        /\p{L}/u.test(year)
          ? year.replace(/i/g, "1").replace(/g/g, "9").replace(/o/g, "0")
          : year,
      )
      // A year read with a g between its century and its decade: 18g91.
      .replace(/(?<![\p{L}\d])(1[89])g(\d{2})(?![\p{L}\d])/gu, "$1$2")
      // Or with 19 read as ig and its 9 or 1 read twice: ig918, ig119.
      .replace(/(?<![\p{L}\d])ig[91](\d{2})(?![\p{L}\d])/gu, "19$1")
      // 11, 19 and 10 read as ii, ig and io before a span of time.
      .replace(
        /(?<![\p{L}\d])(?:ii|ig|io)(?= (?:Uhr|Monate|Monaten|Jahre|Jahren|Wochen|Tage|Tagen)\b)/gu,
        (figure) => ({ ii: "11", ig: "19", io: "10" })[figure] ?? figure,
      )
      // A first read as i before a month or a volume's part; d. i. is "that is".
      .replace(
        /(?<![\p{L}\d.] ?|d\. )i\.(?= (?:Januar|Februar|März|April|Mai|Juni|Juli|August|September|Oktober|November|Dezember|Aufl|Teil|Bd|Band|Halbbd|Heft|Jahrg)\b)/gu,
        "1.",
      )
      // A double quotation mark read as two single ones, or two commas.
      .replace(/‚‚|,,(?=[\p{L}\d])/gu, "„")
      .replace(/‘‘/g, "“")
      // A „ quotation closed with a single mark, where no single quotation
      // opened inside or just before it and no double mark closes it later
      // in the line.
      .replace(/(?<!‚)„([^“‘‚„]*?)‘(?![\p{L}])(?![^„]*“)/gu, "„$1“")
      // Loco citato read with a figure one, a capital I or J, or a capital C;
      // J. C. is a name's initials. A page's p. read with a dash.
      .replace(
        /(?<![\p{L}\d])(?:[1I]\.( ?)[cC]|l\.( ?)C|J\.( ?)c)\.(?!\p{L})/gu,
        (_, a = "", b = "", c = "") => `l.${a}${b}${c}c.`,
      )
      .replace(/(?<![\p{L}\d])p- (?=[\dIVXLC])/gu, "p. ")
      // dgl. read without its stop, and an initial O read with a zero.
      .replace(/(?<![\p{L}])dgl(?![.\p{L}])/gu, "dgl.")
      .replace(/(?<![\p{L}\d])O0\.(?!\d)/gu, "O.")
      // Sch split from the rest of its word: Sch wierigkeiten.
      .replace(/(?<![\p{L}])Sch (?=w\p{Ll})/gu, "Sch")
      // A W read as a backslash and a V, or as \WV; a backslash before a word
      // is a speck.
      .replace(/\\W?V(?=\p{L})/gu, "W")
      .replace(/\\(?=\p{L})/gu, "")
      // Es read as Fs, und as nnd or uud, wir as wif;
      .replace(/(?<![\p{L}])Fs(?= \p{Ll})/gu, "Es")
      .replace(/(?<![\p{L}])(?:nnd|uud)(?![\p{L}])/gu, "und")
      .replace(/(?<![\p{L}])wif(?![\p{L}])/gu, "wir")
      // sei, und, aus, zu, auf, ab and als read with a speck: sel, ünd, äus,
      // zü, äuf, äb, äls.
      .replace(
        /(?<= )(?:sel|ünd|äus|zü|äuf|äb|äls)(?![\p{L}])/gu,
        (word) =>
          ({
            sel: "sei",
            ünd: "und",
            äus: "aus",
            zü: "zu",
            äuf: "auf",
            äb: "ab",
            äls: "als",
          })[word] ?? word,
      )
      // Freud's italic Vbw, the Gradiva's Zoë, and daß and muß, which the OCR misreads.
      .replace(/(?<![\p{L}\d])[YF/7](?=bw(?![\p{L}]))/gu, "V")
      .replace(/(?<![\p{L}\d])(?:YD|vd)w(?![\p{L}])/gu, (word) =>
        word === "YDw" ? "Vbw" : "vbw",
      )
      // The italic W of W-Bw read with a #; Ich read with an l before it.
      .replace(/(?<![\p{L}\d])W#/gu, "W")
      .replace(/(?<![\p{L}])lI(?=ch)/gu, "I")
      // An enumeration's β read as ß, which never stands alone.
      .replace(/(?<![\p{L}] ?)ß\)/gu, "β)")
      .replace(/(?<![\p{L}])Zo(?:6?&|@|£|ë@)/gu, "Zoë")
      .replace(/(?<![\p{L}])(?:da[bl]|dal3)(?= [\p{Ll}„]|$)/gu, "daß")
      .replace(/(?<![\p{L}])mub(?=[ ,.;]|$)/gu, "muß")
      // An umlaut standing alone is a speck the facing page left.
      .replace(/^[öů][‚,]?\s+|\s+[öů][‚,]?(?=\s|$)/gu, "")
      // So is an underscore standing alone, and a backslash: a pencil mark.
      .replace(/^_+\s+|\s+_+(?=\s|$)/gu, "")
      .replace(/^\\+\s+|\s+\\+(?=\s|$)|^\\+$/gu, "")
      // So is one letter over and over standing between words (EEE, nn).
      .replace(
        /^(?:[Ee]{2,}|[Nn]{2,}|R{2,}|T{2,}|o{2,})[,.;:]?\s+|\s+(?:[Ee]{2,}|[Nn]{2,}|R{2,}|T{2,}|o{2,})[,.;:]?(?=\s|$)/gu,
        "",
      )
      // A double hyphen inside a word is its hyphen, the Fraktur one.
      .replace(/(?<=\S)-?⸗+-?(?=\S)/gu, "-")
      // A double hyphen between spaces before a figure is an equals sign; before
      // a word it is a ditto mark, and at the line's end a break.
      .replace(/(?<=\S) ⸗ (?=[\d½¼¾⅓⅔⅛⅕])/gu, " = ")
      // The Fraktur model reads a plus and an equals sign at full width,
      // and a pound after a figure as an ampersand,
      .replace(/＋/g, "+")
      .replace(/＝/g, "=")
      .replace(/(?<=(?:^|[^\p{L}\d])[\d½¼¾⅓⅔⅛⅕⅖⅗⅙⅚⅐⁄¹²³⁰-⁹₀-₉]+ ?)&/gu, "£")
      // and as a quotation mark standing apart after a figure, before no word.
      .replace(
        /(?<=(?:^|[^\p{L}\d])[\d½¼¾⅓⅔⅛⅕⅖⅗⅙⅚⅐⁄¹²³⁰-⁹₀-₉]+ )[«„“](?=[\s,.;:)\]]|$)/gu,
        "£",
      )
  );
}

/** A heading's line as printed, for reading a page against its scan. */
function headingLineText(line: HeadingLine): string {
  switch (line.kind) {
    case "chapter":
      return line.numeral;
    case "letter":
      return line.letter;
    case "named":
      return line.label ?? "";
    // Its title is in the lines after it.
    case "article":
      return "";
    default:
      return line.text;
  }
}

/** The scan leaf a printed page is on. */
export function pageLeaf(hocr: string, printedPage: number | string): number {
  const read = volumeOf(hocr);
  const number = printedNumber(read, printedPage);
  const page = read.pages.find(
    (each) => number !== null && read.printed.get(each.leaf) === number,
  );
  if (!page) throw new Error(`No page ${printedPage}`);
  return page.leaf;
}

/** A page's number as the volume counts it, a roman page of the front matter below 1. */
function printedNumber(read: ReadVolume, page: number | string): number | null {
  if (typeof page === "number") return page;
  return read.front === null
    ? null
    : (read.printed.get(romanValue(page) - read.front) ?? null);
}

/** A page as cited: the front matter's by its roman number. */
function labelOf(read: ReadVolume, number: number, leaf: number): string {
  return number < 1 && read.front !== null
    ? roman(leaf + read.front)
    : String(number);
}

/** The bounds of a work in its volume, and the pages it leaves out. */
interface WorkRange {
  firstPage: number | string;
  lastPage: number | string;
  skipPages?: number[];
}

/** The pages a work spans in its volume, in reading order, each with its number and label. */
function pagesOfWork(
  read: ReadVolume,
  work: WorkRange,
): Array<{ page: Page; number: number; label: string }> {
  const numberOf = (page: number | string): number => {
    const number = printedNumber(read, page);
    if (number === null) throw new Error(`No page ${page}`);
    return number;
  };
  const first = numberOf(work.firstPage);
  const last = numberOf(work.lastPage);
  return read.pages.flatMap((page) => {
    const number = read.printed.get(page.leaf) ?? null;
    return number !== null &&
      number >= first &&
      number <= last &&
      !(work.skipPages ?? []).includes(number)
      ? [{ page, number, label: labelOf(read, number, page.leaf) }]
      : [];
  });
}

/** A work's printed pages in reading order: the front matter's by their roman numbers. */
export function workPages(
  hocr: string,
  work: WorkRange,
): Array<number | string> {
  return pagesOfWork(volumeOf(hocr), work).map(({ number, label }) =>
    number < 1 ? label : number,
  );
}

/**
 * One printed page's text as the importer reads it, line by line, headings
 * and notes included: what an OCR check holds against the scan.
 */
export function pageText(
  hocr: string,
  printedPage: number | string,
  corrections: OcrCorrection[] = [],
): string {
  const { pages, volume } = volumeOf(hocr);
  const leaf = pageLeaf(hocr, printedPage);
  const page = pages.find((each) => each.leaf === leaf);
  if (!page) throw new Error(`No page ${printedPage}`);
  return readPage(page, volume, corrections, String(printedPage))
    .pieces.flatMap((piece) =>
      piece.kind === "heading"
        ? // A topic's or an article's mark prints nothing of its own.
          piece.lines.map(headingLineText).filter((text) => text !== "")
        : [piece.text],
    )
    .join("\n");
}

/**
 * A page's pieces, their text read as the importer reads it and the page's
 * corrections applied. A correction that finds no text to fix is stale, and
 * the import stops rather than keep a misread it meant to fix.
 */
function correctedPieces(
  pieces: Piece[],
  corrections: OcrCorrection[],
  label: string,
): Piece[] {
  const own = corrections.filter(
    (correction) => String(correction.page) === label,
  );
  const read = pieces.map((piece) =>
    piece.kind === "heading"
      ? piece
      : { ...piece, text: normalised(piece.text) },
  );
  // Each correction fixes one place: the line that is its text, else the
  // first line that holds it.
  const texts = own.reduce<Array<string | null>>(
    (lines, correction) => {
      const exact = lines.indexOf(correction.from);
      const at =
        exact >= 0
          ? exact
          : lines.findIndex((line) => line?.includes(correction.from) ?? false);
      if (at < 0) {
        throw new Error(`No "${correction.from}" on page ${label} to correct`);
      }
      return lines.map((line, index) =>
        index === at && line !== null
          ? line.replace(correction.from, correction.to)
          : line,
      );
    },
    read.map((piece) => (piece.kind === "heading" ? null : piece.text)),
  );
  return read.flatMap((piece, index): Piece[] => {
    if (piece.kind === "heading") return [piece];
    const text = (texts[index] ?? "").trim();
    // A line a correction empties was the scan's noise.
    return text === "" ? [] : [{ ...piece, text }];
  });
}

/** A page's lines with corrections applied, each to one line: its own, else the first holding it. */
function correctedLines(
  page: Page,
  corrections: OcrCorrection[],
  label: string,
): Page {
  if (corrections.length === 0) return page;
  const lines = page.lines.map((line) => normalised(line.text));
  const fixed = corrections.reduce<string[]>((done, correction) => {
    const exact = done.indexOf(correction.from);
    const at =
      exact >= 0
        ? exact
        : done.findIndex((line) => line.includes(correction.from));
    if (at < 0) {
      throw new Error(`No "${correction.from}" on page ${label} to correct`);
    }
    return done.map((line, index) =>
      index === at ? line.replace(correction.from, correction.to) : line,
    );
  }, lines);
  return {
    ...page,
    lines: page.lines.flatMap((line, index) => {
      const text = (fixed[index] ?? "").trim();
      // A line a correction empties was the scan's noise.
      if (text === "") return [];
      if (text === lines[index]) return [line];
      // A correction that gives several lines restores those the OCR lost
      // below this one, each in its share of the line's height.
      const parts = text.split("\n").map((part) => part.trim());
      const height = (line.bottom - line.y) / parts.length;
      return parts.map((part, at) => ({
        ...line,
        y: line.y + at * height,
        bottom: line.y + (at + 1) * height,
        text: part,
        corrected: true,
      }));
    }),
  };
}

/** A page as read: its pieces, and its running head with the corrections that reach it. */
interface ReadPage {
  pieces: Piece[];
  head: RunningHead | null;
}

/**
 * A page read into pieces with its corrections. A correction whose text is
 * a whole line of the scan fixes that line before the page is read, so a
 * misread heading or running head can be set right; any other fixes the
 * text where it holds it, else the scan's line that holds it, else what an
 * earlier correction wrote. A correction that finds nothing to fix is stale.
 */
function readPage(
  page: Page,
  volume: Volume,
  corrections: OcrCorrection[],
  label: string,
): ReadPage {
  const own = corrections.filter(
    (correction) => String(correction.page) === label,
  );
  const lines = page.lines.map((line) => normalised(line.text));
  const whole = own.filter((correction) => lines.includes(correction.from));
  const lined = correctedLines(page, whole, label);
  const rest = own.filter((correction) => !whole.includes(correction));
  const pieces = piecesOf(debarred(lined), volume);
  const texts = pieces.flatMap((piece) =>
    piece.kind === "heading" ? [] : [normalised(piece.text)],
  );
  const scanLines = lined.lines.map((line) => normalised(line.text));
  const inScan = rest.filter(
    (correction) =>
      !texts.some((text) => text.includes(correction.from)) &&
      scanLines.some((line) => line.includes(correction.from)),
  );
  const read =
    inScan.length === 0 ? lined : correctedLines(lined, inScan, label);
  return {
    pieces: correctedPieces(
      inScan.length === 0 ? pieces : piecesOf(debarred(read), volume),
      rest.filter((correction) => !inScan.includes(correction)),
      label,
    ),
    head: runningHeadOf(debarred(read), volume),
  };
}

/** No chapter opens below this share of the page's height. */
const FOOT_ZONE = 0.85;
/** A chapter's numeral alone is narrower than this share of the page. */
const NUMERAL_WIDTH = 0.1;
/** A numeral set on a line of its own. */
const LONE_NUMERAL = /^[IVXL]+\.?$/u;
/**
 * The middle of the page's text column, where its full lines centre: the
 * scan may set the column off its own middle, the more so on a facing page.
 */
function middleOf(page: Page): number {
  const full = page.lines.filter((line) => line.width > page.width / 2);
  return full.length > 0
    ? median(full.map((line) => line.x + line.width / 2))
    : page.width / 2;
}

/** A month a day opens a dated line with, no section: 9. August von London. */
const MONTH =
  /^(?:Januar|Februar|März|April|Mai|Juni|Juli|August|September|Oktober|November|Dezember)\b/u;
/**
 * A subsection's number, arabic, roman or after a paragraph sign, and title
 * set on one line: 2. Beraud über die Freudenmädchen; §. 2. Der Werth.
 */
const NUMBERED_SUBSECTION =
  /^(\d{1,2}|[IVX]{1,4}|§\.?\s*\d{1,2})\.\s+(\p{Lu}.*)$/u;
/** A subsection lettered in capitals in the text's type: A. Historisches. */
const LETTERED_SUBSECTION = /^([A-H])\.\s+(\p{Lu}.*)$/u;
/**
 * A subsection numbered or lettered with a bracket, which its title keeps:
 * 1) Maaß der Werthe; a) Die Metamorphose; α) Ricardos Anschauungen.
 */
const BRACKETED_SUBSECTION = /^(\d{1,2}\)|[a-z]\)|[α-ω]\))\s+(\p{Lu}.*)$/u;
/** Space around a title, against the space the page's lines leave: more than it. */
const TITLE_LEADING = 1.5;
/** Space above a section's heading, against the page's line height: more than lines leave. */
const SECTION_SPACE = 0.5;
/** A part's letter and title set on one line: A. Die Physiokraten. */
const LETTERED_PART = /^([A-H])\.\s+(\p{Lu}.*)$/u;
/** A line that opens with a label of its own (a. Der „Geist“ und die „Masse“), or a quotation, a motto below the title. */
const LABELLED = /^(?:\S{1,4}[.)]\s|[„"»])/u;
/** A line broken off before its end: at a comma, a colon, a dash or a word's hyphen. */
const BROKEN_END = /[,;:=⸗—-]$/u;
/** A line the OCR measures this share of the text's size is set as large. */
const SAME_SIZE = 0.95;
/** The lines either side of a line that tell where the margin runs near it. */
const NEAR_LINES = 8;
/** The lines of a page's upper half that tell the text's size, at least. */
const UPPER_LINES = 5;
/** No rule above the notes stands higher on the page than this share of it. */
const RULE_ZONE = 0.25;
/** A line ending this share of the page short of the right margin ends its paragraph. */
const SHORT_END = 0.1;
/** A line that ends further than this share of the page short of the measure stops short. */
const FULL_END = 0.025;
/** A sentence’s end or a colon, its quotation or bracket closed, specks the OCR read after it. */
const CLAUSE_END = /[.!?:][“”"»)]?[\s*'‘’`·]*$/u;
/** Lines starting further left than this share of the page stand in another column. */
const NEAR_COLUMN = 0.3;
/** A title's second line is set this large at least, against its first. */
const TITLE_LINE_SIZE = 0.9;

/** The run of lines around one that are all alike, by the first and last index. */
function runAround(
  lines: Line[],
  index: number,
  alike: (line: Line) => boolean,
): { first: number; end: number } {
  const line = lines[index];
  if (line === undefined || !alike(line)) return { first: index, end: index };
  const unlikeBefore = lines
    .slice(0, index)
    .flatMap((other, at) => (alike(other) ? [] : [at]))
    .at(-1);
  const unlikeAfter = lines.findIndex(
    (other, at) => at > index && !alike(other),
  );
  return {
    first: unlikeBefore === undefined ? 0 : unlikeBefore + 1,
    end: unlikeAfter < 0 ? lines.length - 1 : unlikeAfter - 1,
  };
}

/** A chapter's numeral and title set on one line: I. Die Schwefelbande. */
const NUMBERED_TITLE = /^([IVXL]+\.)\s+(\p{Lu}.*)$/u;

/**
 * A centred line of a chapter's numeral and title read as the two lines a
 * heading sets them on more often, so the heading reads them alike; in a
 * volume that sets numerals on lines of their own, such a line is a list's.
 */
function numberedTitleApart(line: Line, page: Page, volume: Volume): Line[] {
  const match = NUMBERED_TITLE.exec(line.text);
  const centred =
    Math.abs(line.x + line.width / 2 - middleOf(page)) < page.width * CENTRE;
  // A line already read as a heading (I. Vorlesung) keeps its reading.
  if (
    !match?.[1] ||
    !match[2] ||
    !centred ||
    // A note, set smaller or at the page's foot, may open with an initial
    // (L. Oliphant); no chapter opens there.
    line.size < volume.textSize * NOTE_SIZE ||
    line.y > page.height * FOOT_ZONE ||
    headingLineOf(line.text, line.size) !== null
  ) {
    return [line];
  }
  // The heading ends with its title, unless the title breaks off at a
  // hyphen and runs on to the line below: Krankheits- / processe.
  return [
    { ...line, text: match[1], numbered: true },
    {
      ...line,
      text: match[2],
      ends: !/\p{L}-$/u.test(match[2]),
      numbered: true,
    },
  ];
}

/**
 * A dateline: where and when an article was written, or the paper and day
 * it appeared, ending in a day, month and year (14./16. August 1855), its
 * closing bracket as the OCR may read it, a 3 (18553.).
 */
const DATELINE =
  /\p{L}.*\b\d{1,2}\.\s*(?:\/\s*\d{1,2}\.\s*)?\p{L}+\s+1\d{3}[)3]?\.?$/u;
/**
 * A dateline a paragraph opens with, after the paper's marks for its
 * authors, in an editor's brackets or not, and dated by its day or its
 * month alone: ** Köln, 3. Juni. Die Zeiten ändern sich; * Köln, im Januar.
 */
const INLINE_DATELINE =
  /^[*⁎]*\s*\[?(\p{Lu}[\p{L}.]*(?:\s[\p{L}.]+)?,\s*(?:\d{1,2}\.|im)\s*\p{L}+\.)\]?\s/u;
/** A dateline is set no larger than the text, give or take the OCR's measure. */
const DATELINE_SIZE = 1.05;
/** A series' numeral, as Fraktur sets I and J alike, with the part's own title or none. */
const SERIES_NUMERAL = /^([IVXJ]{1,4})\.(?:\s+(\p{Lu}.*))?$/u;
/** Title type is set larger than the text by this much at least, where it fills the column. */
const TITLE_TYPE = 1.06;

/** What a line above a dateline is to its article. */
type ArticleLine =
  /** A series' numeral the page sets beside the dateline. */
  | { kind: "dateline"; numeral: string | null }
  | { kind: "title" }
  | { kind: "numeral"; numeral: string; title: string | null };

/**
 * The lines of a page's newspaper articles by their place: each dateline,
 * set in from the margin further than a paragraph, and the centred lines
 * above it, the article's title in title type and a series' numeral. Text
 * starts at the margin; a title is set in from it, or fills the column in
 * larger type.
 */
function articleLinesOf(
  lines: Line[],
  page: Page,
  volume: Volume,
  margin: number,
): Map<number, ArticleLine> {
  // A title is centred on the text's column, closely: a paragraph's last
  // line is not, and datelines set flush right move the page's middle.
  const middle = margin + volume.column / 2;
  const centred = (line: Line): boolean =>
    Math.abs(line.x + line.width / 2 - middle) < (page.width * CENTRE) / 2;
  const above = (at: number): Array<[number, ArticleLine]> => {
    const line = lines[at];
    if (line === undefined || !centred(line)) return [];
    const numeral = SERIES_NUMERAL.exec(line.text);
    if (numeral?.[1]) {
      return [
        [
          at,
          {
            kind: "numeral",
            numeral: numeral[1].replace(/J/gu, "I"),
            title: numeral[2] ?? null,
          },
        ],
        ...above(at - 1),
      ];
    }
    const title =
      /\p{L}{3}/u.test(line.text) &&
      line.size >= volume.textSize &&
      line.size <= volume.textSize * DISPLAY_SIZE &&
      // Set in twice a paragraph's indent: a paragraph's last line is not.
      (line.x - margin > page.width * INDENT * 2 ||
        line.size >= volume.textSize * TITLE_TYPE);
    return title ? [[at, { kind: "title" }], ...above(at - 1)] : [];
  };
  return new Map(
    lines.flatMap((line, index): Array<[number, ArticleLine]> =>
      line.x - margin > page.width * INDENT * 2 &&
      line.size <= volume.textSize * DATELINE_SIZE &&
      DATELINE.test(line.text)
        ? [
            [
              index,
              {
                kind: "dateline",
                numeral: SERIES_NUMERAL.exec(line.text)?.[1] ?? null,
              },
            ],
            ...above(index - 1),
          ]
        : [],
    ),
  );
}

/** A line of a newspaper article's heading, or its dateline, added to a page's pieces. */
function withArticleLine(
  pieces: Piece[],
  line: Line,
  article: ArticleLine,
): Piece[] {
  if (article.kind === "dateline") {
    const dateline = { kind: "text" as const, opens: true };
    return article.numeral === null
      ? [...pieces, { ...dateline, text: line.text }]
      : [
          ...pieces,
          {
            kind: "heading",
            lines: [
              { kind: "letter", letter: article.numeral.replace(/J/gu, "I") },
            ],
            closed: true,
          },
          {
            ...dateline,
            text: line.text.replace(/^[IVXJ]{1,4}\.\s+/u, ""),
          },
        ];
  }
  if (article.kind === "numeral") {
    return [
      ...pieces,
      {
        kind: "heading",
        lines: [
          { kind: "letter", letter: article.numeral },
          ...(article.title === null
            ? []
            : [
                {
                  kind: "caps" as const,
                  text: article.title,
                  size: line.size,
                  misread: true,
                },
              ]),
        ],
        closed: true,
      },
    ];
  }
  const caps = {
    kind: "caps" as const,
    text: line.text,
    size: line.size,
    misread: true,
  };
  const last = pieces.at(-1);
  // A title of two lines runs on in the heading the first opened.
  return last?.kind === "heading" &&
    last.closed !== true &&
    last.lines[0]?.kind === "article"
    ? [...pieces.slice(0, -1), { ...last, lines: [...last.lines, caps] }]
    : [...pieces, { kind: "heading", lines: [{ kind: "article" }, caps] }];
}

/**
 * One page read as heading blocks, text lines and note lines, in order. A
 * heading is a run of short centred lines: a numeral, a letter, a part's name,
 * lines in capitals, a qualifier in brackets.
 */
function piecesOf(page: Page, volume: Volume): Piece[] {
  const headless = volume.numberedTitles
    ? bodyLines(page, volume).flatMap((line) =>
        // A heading the manifest names stays the line it names.
        headingOpeningOf(line, volume) === undefined
          ? numberedTitleApart(line, page, volume)
          : [line],
      )
    : bodyLines(page, volume);
  if (isPicture(headless)) return [];
  const bodySize = median(headless.map((line) => line.size));
  const bodyHeight = median(headless.map((line) => line.bottom - line.y));
  const middle = middleOf(page);
  // The footnotes open the page's foot: at the rule above them, or at a small
  // line that starts with a note marker. Everything below is notes; measured
  // sizes alone mistake a body line low on a curved page for one.
  // A rule above a line set as large as the text ends a section instead.
  // Notes set as large as the text, below a rule the OCR did not read, stand
  // apart by the space it leaves: full lines below a gap a line high, after
  // a line of text, not a heading's.
  const spacedFoot = (
    line: Line,
    above: Line | undefined,
    below: Line | undefined,
  ): boolean =>
    volume.spacedNotes === true &&
    above !== undefined &&
    line.y - above.bottom > bodyHeight &&
    line.width > volume.column / 2 &&
    !isCentredShort(above) &&
    // A heading below the gap opens a section, not the notes, as does a
    // title run on to a short line centred under it.
    !isCentredShort(line) &&
    !NUMBERED_SUBSECTION.test(line.text) &&
    !(
      below !== undefined &&
      below.x - line.x > page.width * INDENT &&
      Math.abs(below.x + below.width / 2 - (line.x + line.width / 2)) <
        (page.width * CENTRE) / 2 &&
      below.width < volume.column * TITLE_WIDTH
    );
  function isCentredShort(other: Line): boolean {
    return (
      Math.abs(other.x + other.width / 2 - middle) < page.width * CENTRE &&
      other.width < volume.column * HEADING_WIDTH
    );
  }
  // Notes filling most of a page would pass for its text: where the page's
  // lines are as a whole the notes' size against the text of its upper
  // half, the foot is measured against that text.
  const upper = headless.filter(
    (line) => line.y < page.height / 2 && /\p{L}{3}/u.test(line.text),
  );
  const upperSize = median(upper.map((line) => line.size));
  const footSize =
    upper.length >= UPPER_LINES && bodySize < upperSize * FOOT_TEXT_SIZE
      ? upperSize
      : bodySize;
  // Below a rule, notes are set smaller than the text. Long notes may fill
  // more than half the page below their rule, in lines across the text's
  // measure, where a figure's are short, and smaller than the text to the
  // page's foot, where a quotation set small gives way to the text again.
  const notesBelowRule = (rule: Line, index: number): boolean => {
    const rest = headless
      .slice(index + 1)
      .filter((other) => /\p{L}/u.test(other.text));
    const below = rest.find((other) => !isRule(other, footSize));
    return (
      below !== undefined &&
      below.size < footSize * FOOT_TEXT_SIZE &&
      (rule.y > page.height / 2 ||
        (below.width > volume.column / 2 &&
          rest.every((other) => other.size < footSize * SAME_SIZE)))
    );
  };
  // A table's row read from the scan, and a line the manifest names as
  // opening a paragraph, is the text's, never the notes'.
  const named = (line: Line): boolean =>
    isTableRow(line) ||
    (volume.paragraphOpenings ?? []).some((opens) =>
      line.text.startsWith(opens),
    );
  const noteNamed = (line: Line): boolean =>
    (volume.noteOpenings ?? []).some((opens) => line.text.startsWith(opens));
  const footAt = headless.findIndex(
    (line, index) =>
      noteNamed(line) ||
      (!named(line) &&
        line.y > page.height * (isRule(line, footSize) ? RULE_ZONE : 0.5) &&
        (isRule(line, footSize)
          ? notesBelowRule(line, index)
          : // A numbered line set small opens the notes; one only a little
            // smaller than the text does below the space of a rule, more
            // than lines leave, where a list's item is spaced as the text,
            // and the notes run to the page's foot, smaller than the text. A
            // title numbered so is centred, a note nearly the text's size not.
            (NOTE_START.test(line.text) &&
              (line.size < footSize * NOTE_SIZE ||
                (index > 0 &&
                  line.y - (headless[index - 1]?.bottom ?? line.y) >
                    bodyHeight * SECTION_SPACE &&
                  headless
                    .slice(index + 1)
                    .filter((below) => /\p{L}/u.test(below.text))
                    .every((below) => below.size < footSize * SAME_SIZE) &&
                  (line.size < footSize * FOOT_TEXT_SIZE ||
                    (line.size < footSize * SAME_SIZE &&
                      !isCentredShort(line)))))) ||
            // No line of text opens with an asterisk's mark; a note may be
            // set, or measured, as large as the text.
            STAR_NOTE_START.test(line.text) ||
            // Below a line's height of space, a line that opens with a note's
            // mark is a note, though set nearly as large as the text; a title
            // numbered so is centred, and set as large as the text. A note set
            // in from the margin and short of the line may sit as centred.
            (MARKED_NOTE_START.test(line.text) &&
              (!isCentredShort(line) || line.size < footSize * SAME_SIZE) &&
              index > 0 &&
              line.y - (headless[index - 1]?.bottom ?? line.y) > bodyHeight) ||
            spacedFoot(line, headless[index - 1], headless[index + 1]))),
  );
  const noteFrom = footAt < 0 ? headless.length : footAt;
  const textLines = headless.slice(0, noteFrom);
  // Most full lines start at the margin; the lowest quarter of starts finds
  // it, which headings and verse set in from both sides would move.
  const full = textLines.filter((line) => line.width > volume.column / 2);
  const margin =
    [...full.map((line) => line.x)].sort((a, b) => a - b)[
      Math.floor(full.length / 4)
    ] ?? 0;
  // A page scanned askew or curved toward the spine drifts its lines'
  // starts across the page; a paragraph's first line is set in from the
  // lines of text about it, where most start at the margin, a paragraph's
  // last too, and from the page's margin, which a list's hanging lines keep;
  // lines far to its left stand in another column, as text beside a picture
  // does. Glosses in the margin are set smaller.
  const inText = textLines.filter(
    (other) =>
      /\p{L}{3}/u.test(other.text) &&
      !isCentredShort(other) &&
      other.size >= bodySize * NOTE_SIZE,
  );
  const marginNear = (line: Line): number => {
    const at = inText.findIndex((other) => other.y >= line.y);
    const from = Math.max(
      0,
      Math.min(
        (at < 0 ? inText.length : at) - NEAR_LINES,
        inText.length - (2 * NEAR_LINES + 1),
      ),
    );
    const near = inText
      .slice(from, from + 2 * NEAR_LINES + 1)
      .map((other) => other.x)
      .filter((x) => x > line.x - page.width * NEAR_COLUMN)
      .sort((a, b) => a - b);
    return near.length > NEAR_LINES / 2
      ? (near[Math.floor(near.length / 4)] ?? margin)
      : margin;
  };
  // Full lines end at the right margin, an indented first line too.
  const rightMargin = median(full.map((line) => line.x + line.width));
  // The space the page leaves between its lines of text, set close or wide.
  const leading = median(
    full
      .slice(1)
      .map((line, index) => line.y - (full[index]?.bottom ?? line.y))
      .filter((gap) => gap > 0 && gap < bodyHeight),
  );
  // A title stands apart by more space than lines leave, on a page set
  // with wide leading too.
  const titleSpace = Math.max(
    bodyHeight * SECTION_SPACE,
    leading * TITLE_LEADING,
  );
  const opensParagraph = (line: Line, index: number): boolean => {
    const named = volume.paragraphOpenings;
    if (named !== undefined) {
      return named.some((opens) => line.text.startsWith(opens));
    }
    // No paragraph opens in lower case but a list's lettered item: such a
    // line runs on the one above, a word it broke or a quotation set in. A
    // small umlaut opening a word may be a capital the Fraktur model read
    // so (über); alone, it is a speck.
    if (
      /^(?![äöü]\p{L})\p{Ll}/u.test(line.text) &&
      !/^\p{Ll}[).]\s/u.test(line.text)
    ) {
      return false;
    }
    // A line set out to the right margin stands in its column, as does one
    // among lines a column's width from the page's margin; verse ends short
    // of it, set in from the page's margin.
    const justified =
      Math.abs(line.x + line.width - rightMargin) < page.width * INDENT;
    const near = marginNear(line);
    const reference =
      justified || near - margin > page.width * NEAR_COLUMN
        ? Math.max(margin, near)
        : margin;
    const above = textLines[index - 1];
    // On a curved scan a paragraph ends with a sentence, or a colon before a
    // quotation, a speck the OCR read after it: below it, a line
    // opens one where the line above stops short or the line is set in.
    if (volume.curved === true && above !== undefined) {
      return (
        CLAUSE_END.test(above.text) &&
        (above.x + above.width < rightMargin - page.width * FULL_END ||
          line.x - reference > page.width * INDENT)
      );
    }
    if (line.x - reference > page.width * INDENT) return true;
    // A paragraph's last line starts at the margin and ends short of the
    // right one; below it, a line set in however little opens the next.
    return (
      justified &&
      above !== undefined &&
      /\p{L}{3}/u.test(above.text) &&
      Math.abs(above.x - reference) < (page.width * INDENT) / 2 &&
      above.x + above.width < rightMargin - page.width * SHORT_END &&
      line.x - above.x > (page.width * INDENT) / 2
    );
  };
  const articleLines =
    volume.datelined === true
      ? articleLinesOf(textLines, page, volume, margin)
      : new Map<number, ArticleLine>();
  return headless.reduce<Piece[]>((earlier, line, index) => {
    // A section's numeral the scan lost stands above the line the manifest
    // names; the line stays the section's text.
    const lost = (volume.headingOpenings ?? []).find(
      (opening) =>
        opening.numeral !== undefined && line.text.startsWith(opening.opens),
    )?.numeral;
    const pieces: Piece[] =
      lost === undefined
        ? earlier
        : [
            ...earlier,
            {
              kind: "heading",
              lines: [{ kind: "chapter", numeral: lost }],
              closed: true,
            },
          ];
    if (index >= noteFrom) {
      if (
        !/\p{L}/u.test(line.text) ||
        isRule(line, bodySize) ||
        SIGNATURE.test(line.text) ||
        isEdgeNoise(line.text) ||
        (!isTableRow(line) && isScraps(line.text))
      ) {
        return pieces;
      }
      return [
        ...pieces,
        {
          kind: "note",
          text: line.text,
          // A note opens with its mark, its digit read amiss or lost; in
          // notes set as the text is, it is set in where the OCR lost its
          // mark; where the manifest names a page's notes, there alone.
          opens:
            volume.noteOpenings !== undefined
              ? noteNamed(line) &&
                !(volume.noteRunsOn ?? []).some((opens) =>
                  line.text.startsWith(opens),
                )
              : NOTE_START.test(line.text) ||
                MARKED_NOTE_START.test(line.text) ||
                (volume.spacedNotes === true &&
                  line.x - margin > page.width * INDENT),
        },
      ];
    }
    if (
      line.size < volume.textSize * MARK_SIZE &&
      line.width < volume.column / 2
    ) {
      return pieces;
    }
    // A table's row is text, however large the OCR read the line it fixes,
    // and so is a line the manifest names as opening a paragraph.
    if (isTableRow(line) || named(line)) {
      return [
        ...pieces,
        { kind: "text", text: line.text, opens: opensParagraph(line, index) },
      ];
    }
    const article = articleLines.get(index);
    if (article !== undefined) return withArticleLine(pieces, line, article);
    // A heading the edition sets in the text's type opens where the manifest
    // says. Named with its level, it is that heading, its title after its
    // label and the stop the label takes; a chapter's or part's title may
    // run on, and so may a section's, to a centred line.
    const opening = headingOpeningOf(line, volume);
    if (opening?.level !== undefined) {
      const label = opening.label ?? null;
      const named: HeadingLine[] = [
        { kind: "named", level: opening.level, label },
        {
          kind: "caps",
          text:
            label !== null && line.text.startsWith(label)
              ? line.text.slice(label.length).replace(/^[.,:]?\s+/u, "")
              : line.text,
          size: line.size,
          misread: true,
        },
      ];
      return [
        ...pieces,
        opening.level >= 2
          ? { kind: "heading", lines: named, closed: true, subsection: true }
          : { kind: "heading", lines: named },
      ];
    }
    // Otherwise a numbered piece opens by its number, a chapter without its
    // numeral numbered by place; a chapter's title may run on.
    if (opening !== undefined) {
      const labelled =
        NUMBERED_SUBSECTION.exec(line.text) ??
        BRACKETED_SUBSECTION.exec(line.text);
      return [
        ...pieces,
        labelled?.[1] && labelled[2]
          ? {
              kind: "heading",
              lines: [
                { kind: "letter", letter: labelled[1] },
                {
                  kind: "caps",
                  text: labelled[2],
                  size: line.size,
                  misread: true,
                },
              ],
              closed: true,
              subsection: true,
            }
          : {
              kind: "heading",
              lines: [
                { kind: "chapter", numeral: "", named: true },
                {
                  kind: "caps",
                  text: line.text,
                  size: line.size,
                  misread: true,
                },
              ],
            },
      ];
    }
    // An article without a title of its own opens with its dateline, which
    // titles it; the paragraph keeps it.
    const inline =
      volume.datelined === true && line.x - margin > page.width * INDENT
        ? INLINE_DATELINE.exec(line.text)?.[1]
        : undefined;
    if (inline !== undefined) {
      return [
        ...pieces,
        {
          kind: "heading",
          lines: [
            { kind: "article" },
            { kind: "caps", text: inline, size: line.size, misread: true },
          ],
          closed: true,
        },
        { kind: "text", text: line.text, opens: true },
      ];
    }
    const centre = line.x + line.width / 2;
    const last = pieces.at(-1);
    // A heading runs on until a line ends it.
    const open = last?.kind === "heading" && last.closed !== true;
    // A heading opens with a short or large centred line; once open, it runs
    // on through centred lines however wide.
    // An open heading runs on through lines in title type wherever the
    // OCR sets their edges, which a stray mark beside a line moves.
    const centred =
      (Math.abs(centre - middle) < page.width * CENTRE ||
        (open && line.size > volume.textSize * HEADING_SIZE)) &&
      // A running head is no section's bare name, nor a numeral with a title.
      (line.y > page.height * HEAD_ZONE ||
        line.numbered === true ||
        SECTION_NAME.test(line.text.trim())) &&
      (open ||
        line.width < volume.column * HEADING_WIDTH ||
        line.size > volume.textSize * HEADING_SIZE);
    // A numbered subsection's title runs on to a centred line in its type
    // that numbers nothing of its own; a bracketed one's, centred closely.
    const subsectionTitle =
      last?.kind === "heading" && last.subsection === true
        ? last.lines.at(-1)
        : undefined;
    const bracketed =
      last?.kind === "heading" &&
      last.lines.some(
        (above) => above.kind === "letter" && above.letter.endsWith(")"),
      );
    if (
      last?.kind === "heading" &&
      subsectionTitle?.kind === "caps" &&
      // A title read as running on takes its next line as it was measured.
      (last.runsOn === true ||
        (Math.abs(centre - middle) <
          page.width * (bracketed ? CENTRE / 2 : CENTRE) &&
          line.width < volume.column * TITLE_WIDTH &&
          !LABELLED.test(line.text))) &&
      line.size >= subsectionTitle.size * TITLE_LINE_SIZE &&
      (line.corrected === true || isWordy(line.text, volume.spelling))
    ) {
      return [
        ...pieces.slice(0, -1),
        {
          ...last,
          lines: [
            ...last.lines.slice(0, -1),
            {
              ...subsectionTitle,
              text: `${subsectionTitle.text} ${line.text}`,
            },
          ],
          subsection: false,
        },
      ];
    }
    // A centred line of a number and its title opens a numbered subsection,
    // which ends with the line: 2. Beraud über die Freudenmädchen.
    const subsection =
      NUMBERED_SUBSECTION.exec(line.text) ??
      // A lettered title in display type opens a part.
      (line.size > volume.textSize * HEADING_SIZE
        ? null
        : LETTERED_SUBSECTION.exec(line.text)) ??
      BRACKETED_SUBSECTION.exec(line.text);
    // A roman numeral and title on one centred line opens a chapter,
    // numbered by its place, where it is set in display type or its first
    // numbered section follows it: II. Die Grundrente. 1. Rodbertus.
    const firstSection = /^\d{1,2}\.\s+\p{Lu}/u.test(
      // Past a rule or an ornament, which the OCR reads as tiny scraps.
      headless
        .slice(index + 1)
        .find(
          (below) =>
            /\p{L}/u.test(below.text) &&
            below.size >= volume.textSize * NOTE_SIZE,
        )?.text ?? "",
    );
    if (
      subsection?.[1] &&
      subsection[2] &&
      /^[IVX]+$/u.test(subsection[1]) &&
      Math.abs(centre - middle) < page.width * CENTRE &&
      (firstSection ||
        (line.size > volume.textSize * HEADING_SIZE &&
          line.width < volume.column * HEADING_WIDTH)) &&
      headingLineOf(line.text, line.size) === null
    ) {
      return [
        ...pieces,
        {
          kind: "heading",
          lines: [
            { kind: "chapter", numeral: subsection[1], named: true },
            {
              kind: "caps",
              text: subsection[2],
              size: line.size,
              misread: true,
            },
          ],
        },
      ];
    }
    // Set as wide as the text, it stands apart by the space above it, and
    // ends in a centred line of its own or space below; a paragraph that
    // opens with a number (12. April.) runs on in full lines.
    const below = headless[index + 1];
    const endsAsTitle =
      below === undefined ||
      // An arabic or paragraph number: roman ones number examples too.
      (/^(?:\d|§)/u.test(line.text) &&
        /[.:]["“”]?$/u.test(line.text) &&
        below.x - margin > page.width * INDENT) ||
      below.y - line.bottom > bodyHeight ||
      (Math.abs(below.x + below.width / 2 - middle) < page.width * CENTRE &&
        below.width < volume.column * TITLE_WIDTH);
    const textAbove = headless
      .slice(0, index)
      .filter(
        (other) =>
          /\p{L}/u.test(other.text) &&
          other.size >= volume.textSize * NOTE_SIZE,
      )
      .at(-1);
    // The page's head, its running head already read off, sets it apart too.
    const spacedAbove =
      (textAbove === undefined ||
        line.y - textAbove.bottom > bodyHeight * SECTION_SPACE) &&
      endsAsTitle;
    // A list's items are lettered and bracketed too, set at the margin; a
    // title lettered or bracketed so is centred closely, or set across the
    // measure with space above and below it. No title ends broken off, unless
    // it runs on to a centred line.
    const dotted = NUMBERED_SUBSECTION.test(line.text);
    const closelyCentred =
      Math.abs(centre - middle) < page.width * (dotted ? CENTRE : CENTRE / 2);
    // Space measured top to top: a short line's box leaves more than its type.
    const roomAbove =
      textAbove === undefined ||
      line.y - textAbove.y > bodyHeight * (1 + SECTION_SPACE);
    // Its next line is centred under it, and short, or set in from both of
    // the text's margins below space above, where a list's item hangs its
    // lines and a paragraph's reach a margin.
    const runsOn =
      below !== undefined &&
      below.y - line.bottom < bodyHeight * SECTION_SPACE &&
      Math.abs(below.x + below.width / 2 - centre) <
        (page.width * CENTRE) / 2 &&
      (below.width < volume.column * TITLE_WIDTH ||
        (roomAbove &&
          below.x - margin > page.width * INDENT &&
          rightMargin - (below.x + below.width) > page.width * INDENT));
    const spacedApart =
      below !== undefined &&
      roomAbove &&
      below.y - line.y > bodyHeight * (1 + SECTION_SPACE);
    if (
      subsection?.[1] &&
      subsection[2] &&
      (dotted || !BROKEN_END.test(subsection[2]) || runsOn) &&
      // A note numbered so is set smaller than a title, or ends the page,
      // where Greek letters number no notes and their titles are set small; a
      // list's item starts where the next one does, and no space sets it
      // apart nor runs it on.
      (dotted ||
        ((line.size >= volume.textSize * TITLE_LINE_SIZE ||
          /^[α-ω]\)$/u.test(subsection[1])) &&
          below !== undefined &&
          (Math.abs(below.x - line.x) > (page.width * INDENT) / 4 ||
            spacedApart ||
            runsOn))) &&
      ((closelyCentred &&
        (line.width < volume.column * HEADING_WIDTH || (!dotted && runsOn))) ||
        (dotted ? spacedAbove : spacedApart)) &&
      // Low on the page a title has the text run on below it in its type,
      // where a note's lines are set small.
      (line.y < page.height * FOOT_ZONE ||
        (below !== undefined &&
          below.size >= volume.textSize * TITLE_LINE_SIZE)) &&
      line.size >= volume.textSize * NOTE_SIZE &&
      // A roman label set smaller than the text is a table's, unless space
      // below sets it apart from the text as a title; one the OCR measures a
      // hair under the text is set as large.
      (!/^[IVX]+$/u.test(subsection[1]) ||
        line.size >= volume.textSize * SAME_SIZE ||
        (below !== undefined &&
          below.y - line.bottom > bodyHeight * SECTION_SPACE)) &&
      (line.corrected === true || isWordy(subsection[2], volume.spelling)) &&
      !MONTH.test(subsection[2]) &&
      // A newspaper article has no numbered sections: its numbers are a
      // list's, as Gladstone's budget items are.
      (volume.datelined !== true || /^[IVX]+$/u.test(subsection[1])) &&
      // A chapter named so (2. Kapitel) is read as one.
      headingLineOf(line.text, line.size) === null
    ) {
      return [
        ...pieces,
        {
          kind: "heading",
          lines: [
            {
              kind: "letter",
              letter: subsection[1].replace(/^§\.?\s*/u, "§ "),
            },
            {
              kind: "caps",
              text: subsection[2],
              size: line.size,
              misread: true,
            },
          ],
          closed: true,
          subsection: true,
          runsOn:
            runsOn &&
            (line.width >= volume.column * HEADING_WIDTH ||
              BROKEN_END.test(subsection[2])),
        },
      ];
    }
    const reading = centred ? headingLineOf(line.text, line.size) : null;
    // A numeral read apart from its title on one line names a chapter, as a
    // chapter named in words does: no example's number.
    const read =
      reading?.kind === "chapter" && line.numbered === true
        ? { ...reading, named: true }
        : reading;
    // The line after a numeral, letter or part's name is its title, even where
    // the OCR read its capitals as small letters, or set in display type
    // across the column.
    const above = open ? last.lines.at(-1) : undefined;
    const titles =
      above !== undefined &&
      (above.kind === "part" ||
        above.kind === "chapter" ||
        above.kind === "letter" ||
        (above.kind === "caps" &&
          (above.misread === true || SECTION_NAME.test(above.text)))) &&
      (line.width < volume.column * TITLE_WIDTH ||
        line.size > volume.textSize * HEADING_SIZE ||
        // After a chapter named in words, a line short of the column is its
        // title; a numeral alone may stand above the text's first line.
        (above.kind === "chapter" &&
          above.named === true &&
          line.width < volume.column * HEADING_WIDTH) ||
        // A preface's or appendix's bare name takes the line below as title.
        (above.kind === "caps" &&
          SECTION_NAME.test(above.text) &&
          line.width < volume.column * HEADING_WIDTH) ||
        // A part's title runs on through lines larger than the text.
        (last?.kind === "heading" &&
          last.lines.some((heading) => heading.kind === "part") &&
          line.size > volume.textSize &&
          line.width < volume.column * HEADING_WIDTH));
    // A title set in display type, larger than the text, need not be in
    // capitals; Fraktur's display type has none to read.
    // Two text lines the OCR read as one are as large, but fill the column
    // between the lines around them; a title as wide stands apart from them.
    // A title of several lines stands apart as a whole; rules and ornaments
    // around it are not the text it stands apart from.
    const titleType = (other: Line): boolean =>
      other.size > volume.textSize * HEADING_SIZE;
    const isText = (other: Line): boolean =>
      /\p{L}/u.test(other.text) && other.size >= volume.textSize * NOTE_SIZE;
    const { first, end } = runAround(headless, index, titleType);
    const before = headless.slice(0, first).filter(isText).at(-1);
    const after = headless.slice(end + 1).find(isText);
    const top = headless[first]?.y ?? line.y;
    const bottom = headless[end]?.bottom ?? line.bottom;
    // A page set in large type throughout, a dedication, has no text for a
    // title to stand apart from. Display type's tall lines leave less space
    // between their boxes than a line's height; half of one is more than
    // text lines leave, even two the OCR read as one.
    const apart =
      (before !== undefined || after !== undefined) &&
      (before === undefined || top - before.bottom > titleSpace) &&
      (after === undefined || after.y - bottom > titleSpace);
    // A title opens with a capital, past a bracket or quotation mark; a
    // dedication's or a list's line does not.
    const display =
      /^[[(„"]?\p{Lu}/u.test(line.text) &&
      (apart ||
      // A title line well short of the column, on a page with text: two
      // text lines read as one fill it, and a dedication has no text.
      (line.width < volume.column * TITLE_WIDTH &&
        (before !== undefined || after !== undefined))
        ? line.size > volume.textSize * HEADING_SIZE
        : line.size > volume.textSize * DISPLAY_SIZE &&
          line.bottom - line.y > bodyHeight * DISPLAY_HEIGHT &&
          line.width < volume.column * HEADING_WIDTH);
    // A lettered title on one line opens a part: A. Die Physiokraten.
    const lettered = LETTERED_PART.exec(line.text);
    if (
      !open &&
      centred &&
      display &&
      lettered?.[1] &&
      lettered[2] &&
      isWordy(lettered[2], volume.spelling)
    ) {
      return [
        ...pieces,
        {
          kind: "heading",
          lines: [
            { kind: "part", text: lettered[1] },
            { kind: "caps", text: lettered[2], size: line.size, misread: true },
          ],
        },
      ];
    }
    const candidate: HeadingLine | null =
      read ??
      (centred && (titles || display)
        ? { kind: "caps", text: line.text, size: line.size, misread: true }
        : null);
    // A title is made of the work's words; a picture's scraps are not.
    const headingLine =
      candidate?.kind === "caps" &&
      !SECTION_NAME.test(candidate.text) &&
      line.corrected !== true &&
      !isWordy(candidate.text, volume.spelling)
        ? null
        : candidate;
    if (headingLine) {
      // A qualifier only qualifies a heading; alone it is running text.
      if (headingLine.kind !== "qualifier" || open) {
        // A numeral, letter or part's name opens the next heading.
        const continues =
          open &&
          (headingLine.kind === "caps" ||
            headingLine.kind === "qualifier" ||
            last.lines.every((above) => above.kind === "qualifier"));
        const closed = line.ends === true;
        return continues
          ? [
              ...pieces.slice(0, -1),
              { kind: "heading", lines: [...last.lines, headingLine], closed },
            ]
          : [
              ...pieces,
              {
                kind: "heading",
                // Articles stand under a topic set in heading type.
                lines:
                  volume.datelined === true &&
                  headingLine.kind === "caps" &&
                  headingLine.size > volume.textSize * HEADING_SIZE
                    ? [{ kind: "part", text: "" }, headingLine]
                    : [headingLine],
                closed,
              },
            ];
      }
    }
    if (SIGNATURE.test(line.text) || isEdgeNoise(line.text)) return pieces;
    // Scraps without a word, away from the margin or several of them, are
    // marks on the scan, such as a rule read as letters; not a line's end.
    // A table's row read from the scan is no scrap.
    if (
      !isTableRow(line) &&
      isWordless(line.text) &&
      (Math.abs(line.x - margin) > page.width * INDENT || isScraps(line.text))
    ) {
      return pieces;
    }
    return [
      ...pieces,
      {
        kind: "text",
        text: line.text,
        opens: opensParagraph(line, index),
      },
    ];
  }, []);
}

/**
 * Join a line onto the text before it. A word broken at the line end loses
 * its hyphen when it continues in lower case; a capitalised continuation is a
 * compound and keeps it, as does a first part set apart before und or oder. The OCR sometimes reads the break as a stray dot.
 */
/** A compound's first part set apart, its last part after the conjunction: Kredit- und Bankwesen. */
const SET_APART = /^(?:und|oder|bis|sowie)(?![\p{L}-])/u;

function joinLine(before: string, line: string): string {
  if (before.length === 0) return line;
  if (/\p{L}-$/u.test(before) && SET_APART.test(line))
    return `${before} ${line}`;
  if (/\p{L}-$/u.test(before)) {
    const rest = line.replace(/^[.·,'’]+/, "");
    return /^\p{Ll}/u.test(rest) ? before.slice(0, -1) + rest : before + rest;
  }
  return `${before} ${line}`;
}

/** A paragraph or note, and where its text starts. */
/** A sentence's end, its quotation closed or its bracket. */
const SENTENCE_END = /[.!?][“”"»)]?$/u;

/** A note an editor signed with an initial after its last sentence: … des Manuskripts. K. */
const SIGNED_NOTE_END = /(?:[.!?][“”"»)]?|[“”"»)]\.) \p{Lu}\.$/u;

interface Block {
  text: string;
  page: number;
  leaf: number;
  /** The page as printed: its number, or its roman number in the front matter. */
  label: string;
  /** The scan leaf the block ends on, where it runs over pages. */
  lastLeaf: number;
}

interface Place {
  page: number;
  leaf: number;
  label: string;
}

function addLine(
  blocks: Block[],
  line: string,
  opens: boolean,
  place: Place,
): Block[] {
  const last = blocks.at(-1);
  // A table's row stands alone: it runs on no line, and no line on it.
  if (
    opens ||
    last === undefined ||
    tableCells(line) !== null ||
    tableCells(last.text) !== null
  ) {
    return [
      ...blocks,
      {
        text: line,
        ...place,
        lastLeaf: place.leaf,
      },
    ];
  }
  // A page that opens on no paragraph runs on the sentence the page before
  // left open, though notes read as text stand between, opening with their
  // marks or signed by their editor's initial; the text runs on below them.
  const open =
    last.lastLeaf < place.leaf && SENTENCE_END.test(last.text)
      ? blocks.reduce(
          (found, block, index) =>
            block.lastLeaf === last.lastLeaf && !SENTENCE_END.test(block.text)
              ? index
              : found,
          -1,
        )
      : -1;
  const at =
    open >= 0 &&
    blocks
      .slice(open + 1)
      .every(
        (block) =>
          NOTE_START.test(block.text) ||
          MARKED_NOTE_START.test(block.text) ||
          STAR_NOTE_START.test(block.text) ||
          SIGNED_NOTE_END.test(block.text),
      )
      ? open
      : blocks.length - 1;
  const into = blocks[at] ?? last;
  return [
    ...blocks.slice(0, at),
    ...blocks.slice(at + 1),
    { ...into, text: joinLine(into.text, line), lastLeaf: place.leaf },
  ];
}

/** A note's mark a title carries: *), **), or a superscript figure the OCR may read as a dotless i: ¹). */
const TITLE_NOTE_MARK = /\s*(?:\*+|[ı¹²³⁴⁵⁶⁷⁸⁹⁰]+)\)/gu;

/** A heading as it stands in the work: its level and its cased title. */
interface PathStep {
  level: number;
  /** A part's name, a subsection's letter, or a chapter's numeral. */
  label: string | null;
  /** The heading's own words, cased. */
  name: string;
  qualifiers: string[];
  /** A subsection's letter. */
  letter: string | null;
  /** A chapter numbered by its numeral. */
  numbered: boolean;
  /** Its title set in capitals, which tell no case. */
  capitals: boolean;
}

/** The text under one heading, with the headings above it. */
interface Section {
  path: PathStep[];
  paragraphs: Block[];
  notes: Block[];
}

interface WorkState {
  sections: Section[];
  /** Chapters so far, which number the next by its place. */
  chapters: number;
  /** The level of a section the manifest leaves out, with the sections under it. */
  skipping: number | null;
}

/** A heading's title in the work, its words cased as the text spells them. */
/** A heading as titled: its label, its name, and qualifiers after them. */
function titleOf(step: PathStep, name: string = step.name): string {
  const named = [step.label, name].filter(
    (part): part is string => part !== null && part !== "",
  );
  // A label with its bracket, 1), is set off by it.
  const joined = step.label?.endsWith(")") === true ? " " : ". ";
  return [named.join(joined), ...step.qualifiers].join(" ");
}

/**
 * A heading's level: an unnumbered one stands below an open numbered
 * chapter, and beside other unnumbered ones.
 */
function levelOf(heading: Heading, path: PathStep[]): number {
  // A piece numbered with a bracket stands below the section numbered in
  // roman above it: VIII. Nachtrag, 1) Beilage. The manifest's level stands.
  if (
    !heading.printed &&
    heading.level === 2 &&
    /^\d+\)$/u.test(heading.label ?? "") &&
    /^[IVXL]+$/u.test(
      path.filter((step) => step.level === 2).at(-1)?.letter ?? "",
    )
  ) {
    return 3;
  }
  if (heading.level !== null) return heading.level;
  // A preface or an appendix stands beside the chapters, within the part
  // it closes, not under the last chapter.
  if (SECTION_NAME.test(heading.title[0] ?? "")) return 1;
  return path.some((step) => step.level === 1 && step.numbered) ? 2 : 1;
}

/** Subsection I follows H, titled in capitals, and reads like the numeral I. */
function asLetter(heading: Heading, path: PathStep[]): Heading {
  const letter = path.filter((step) => step.level === 2).at(-1)?.letter;
  return heading.numbered &&
    letter === "H" &&
    heading.title.length > 0 &&
    !heading.misread &&
    /^[Il1|]$/u.test(heading.numeral ?? "")
    ? { ...heading, level: 2, label: "I", numbered: false, numeral: null }
    : heading;
}

function addHeading(
  state: WorkState,
  read: Heading,
  cased: (capitals: string) => string,
  place: Place,
  workTitle: string,
  skip: string[],
): WorkState {
  const heading = asLetter(read, state.sections.at(-1)?.path ?? []);
  // Inside a lettered subsection, a numeral without a title in capitals
  // numbers an example; the example's name, if any, is text.
  const path = state.sections.at(-1)?.path ?? [];
  if (
    heading.numbered &&
    !heading.named &&
    (heading.title.length === 0 || heading.misread) &&
    path.some((step) => step.level === 2)
  ) {
    return heading.title.reduce<WorkState>(
      (done, line) =>
        addPiece(done, { kind: "text", text: line, opens: true }, place),
      state,
    );
  }
  // Inside a lettered subsection, a numbered one is an example, its number
  // and name text: 5. Ein Traum bei Kindern; not one the manifest names.
  if (
    !heading.printed &&
    heading.level === 2 &&
    /^\d+$/u.test(heading.label ?? "") &&
    path.some((step) => step.level === 2 && /^[A-H]$/u.test(step.letter ?? ""))
  ) {
    return addPiece(
      state,
      {
        kind: "text",
        text: [`${heading.label}.`, ...heading.title].join(" "),
        opens: true,
      },
      place,
    );
  }
  // Sections count up within a chapter; a number not past the last
  // section's numbers a list's item, its number and words text.
  const sibling = path.filter((step) => step.level === 2).at(-1)?.letter;
  if (
    !heading.printed &&
    heading.level === 2 &&
    /^\d+$/u.test(heading.label ?? "") &&
    /^\d+$/u.test(sibling ?? "") &&
    Number(heading.label) <= Number(sibling)
  ) {
    return addPiece(
      state,
      {
        kind: "text",
        text: [`${heading.label}.`, ...heading.title].join(" "),
        opens: true,
      },
      place,
    );
  }
  // The work's own title, which the manifest already gives, opens it and
  // may stand again on a half-title or above the text.
  if (
    heading.level === null &&
    namesTitle(heading.title.join(" "), workTitle)
  ) {
    return state;
  }
  // A lone digit is a note marker unless a title names its section.
  if (/^\d+$/u.test(heading.numeral ?? "") && heading.title.length === 0) {
    return state;
  }
  // A chapter labelled as printed counts as the numeral its label opens
  // with, IIIb as III: the next numbered by place follows it.
  const printedNumeral =
    heading.printed && heading.level === 1
      ? /^[IVXL]+/u.exec(heading.label ?? "")?.[0]
      : undefined;
  const chapters =
    printedNumeral === undefined
      ? state.chapters + (heading.numbered ? 1 : 0)
      : romanValue(printedNumeral);
  const level = levelOf(heading, path);
  // A section left out leaves out the sections under it.
  if (state.skipping !== null && level > state.skipping) {
    return { ...state, chapters };
  }
  // A section left out still holds its place among the chapters.
  if (skip.some((title) => namesTitle(heading.title.join(" "), title, true))) {
    return { ...state, chapters, skipping: level };
  }
  const step = {
    level,
    label: heading.numbered
      ? roman(chapters)
      : heading.label === null
        ? null
        : // A number, arabic or roman, or a bracketed label is no word to
          // case, nor is a label as printed.
          heading.printed ||
            /^(?:\d+|[IVX]+|\d+\)|[a-z]\)|[α-ω]\))$/u.test(heading.label)
          ? heading.label
          : cased(heading.label),
    // A subtitle follows its title after one full stop, or after the comma
    // it goes on from; the title is cased as a whole, without the marks of
    // the notes it carries.
    name: cased(
      heading.title
        .reduce(
          (name, line) =>
            name === ""
              ? line
              : /[.!?:,;]$/u.test(name)
                ? `${name} ${line}`
                : `${name}. ${line}`,
          "",
        )
        .replace(TITLE_NOTE_MARK, ""),
    ),
    qualifiers: heading.qualifiers,
    letter: level === 2 ? heading.label : null,
    // A chapter labelled as printed is numbered by its label.
    numbered:
      heading.numbered ||
      (heading.printed && level === 1 && heading.label !== null),
    capitals:
      /\p{Lu}/u.test(heading.title.join(" ")) &&
      !/\p{Ll}/u.test(heading.title.join(" ")),
  };
  return {
    sections: [
      ...state.sections,
      {
        path: [...path.filter((above) => above.level < level), step],
        paragraphs: [],
        notes: [],
      },
    ],
    chapters,
    skipping: null,
  };
}

function addPiece(
  state: WorkState,
  piece: Extract<Piece, { kind: "text" | "note" }>,
  place: Place,
): WorkState {
  if (state.skipping !== null) return state;
  const current = state.sections.at(-1) ?? {
    path: [],
    paragraphs: [],
    notes: [],
  };
  const rest = state.sections.length > 0 ? state.sections.slice(0, -1) : [];
  const text = normalised(piece.text);
  // A note runs on only from the page before; one ended pages back takes
  // no lines from a note the reader found without its mark.
  const lastNote = current.notes.at(-1);
  const notePages =
    lastNote === undefined || lastNote.lastLeaf >= place.leaf - 1;
  const section =
    piece.kind === "note"
      ? {
          ...current,
          notes: addLine(current.notes, text, piece.opens || !notePages, place),
        }
      : {
          ...current,
          paragraphs: addLine(current.paragraphs, text, piece.opens, place),
        };
  return { ...state, sections: [...rest, section] };
}

export interface ArchiveOcrOptions {
  /** Bytes of text per part of a long chapter. */
  entryBytes?: number;
}

/** A running head's words: its page number, scraps and numeral taken off. */
function headName(text: string): string {
  return (
    text
      .replace(/^(?:\S{1,2}\s+)?[\dı]+[.,]?\s+/u, "")
      .replace(/\s+[\dı]+\S{0,2}$/u, "")
      // A roman page number in the front matter, at either end.
      .replace(/^[IVXL]+\s+|\s+[IVXL]+$/u, "")
      .replace(/^[IVXLvxlı1]+[.,]\s*/u, "")
      .replace(/^[A-H][.)]\s+/u, "")
      .trim()
  );
}

/** Share of a name's words the work's text uses. */
function knownShare(name: string, spelling: Spelling): number {
  const words = name.match(/\p{L}+/gu) ?? [];
  return words.length === 0
    ? 0
    : words.filter((word) => spelling.knows(word)).length / words.length;
}

/**
 * A heading's name: the page's own heading, as corrected. The running heads
 * over the heading's pages that name the same thing stand in for it only
 * where the OCR could not read it, the work's text knowing their words
 * better than the heading's; then the head a correction set right counts
 * first, else the one printed most often. A heading set in capitals tells
 * no case, and the OCR loses its umlauts: a head that reads as well stands
 * in for it.
 */
function namedByHeads(
  step: PathStep,
  sections: Section[],
  headsByLeaf: Map<number, RunningHead>,
  spelling: Spelling,
): string {
  if (step.name === "") return step.name;
  const heads = sections
    .filter((section) => section.path.includes(step))
    .flatMap((section) =>
      section.paragraphs.flatMap((block) =>
        Array.from(
          { length: block.lastLeaf - block.leaf + 1 },
          (_, index) => block.leaf + index,
        ),
      ),
    )
    .flatMap((leaf) => {
      const head = headsByLeaf.get(leaf);
      // A head set in capitals tells no more of the case than the heading.
      return head !== undefined &&
        /\p{Ll}/u.test(head.name) &&
        sameName(head.name, step.name)
        ? [head]
        : [];
    });
  const counts = heads.reduce(
    (tally, head) =>
      tally.set(head.name, {
        count: (tally.get(head.name)?.count ?? 0) + 1,
        corrected: (tally.get(head.name)?.corrected ?? false) || head.corrected,
      }),
    new Map<string, { count: number; corrected: boolean }>(),
  );
  const head = [...counts].sort(
    (a, b) =>
      Number(b[1].corrected) - Number(a[1].corrected) ||
      b[1].count - a[1].count ||
      (a[0] < b[0] ? -1 : 1),
  )[0]?.[0];
  if (head === undefined) return step.name;
  const known = knownShare(head, spelling) - knownShare(step.name, spelling);
  return known > 0 || (step.capitals && known === 0) ? head : step.name;
}

/** A volume as read once for all the works it holds. */
interface ReadVolume {
  pages: Page[];
  printed: Map<number, number | null>;
  volume: Volume;
  /** The front matter's roman offset, if it has roman heads. */
  front: number | null;
}

/** A word with a small e set above a letter, as Fraktur models read an umlaut or a speck over it. */
const SMALL_E = /\p{L}+\u0364[\p{L}\u0364]*/gu;
const UMLAUTS: Record<string, string> = {
  a: "ä",
  o: "ö",
  u: "ü",
  A: "Ä",
  O: "Ö",
  U: "Ü",
};

/**
 * The volume's words with a small e above a letter read as the volume spells
 * them elsewhere: an umlaut (naͤmlich), a speck (Gebraͤuchswerth, säͤchsische),
 * or an umlaut the model read as the mark alone (wͤre); a word it spells no
 * such way stays as read.
 */
function withUmlauts(pages: Page[]): Page[] {
  const uses = pages
    .flatMap((page) =>
      page.lines.flatMap(
        (line) => line.text.toLowerCase().match(/\p{L}+/gu) ?? [],
      ),
    )
    .reduce(
      (seen, word) => seen.set(word, (seen.get(word) ?? 0) + 1),
      new Map<string, number>(),
    );
  // Each mark is a speck, or the umlaut of the vowel below it, or after
  // another letter an umlaut of its own; the plain reading comes first.
  const readings = (word: string): string[] => {
    const at = word.indexOf("\u0364");
    if (at < 0) return [word];
    const before = word.slice(0, at);
    const rest = readings(word.slice(at + 1));
    const last = before.slice(-1);
    const heads = [
      before,
      ...(UMLAUTS[last] ? [`${before.slice(0, -1)}${UMLAUTS[last]}`] : []),
      ...(/[äöüÄÖÜ]/u.test(last) || UMLAUTS[last]
        ? []
        : ["ä", "ö", "ü"].map((umlaut) => `${before}${umlaut}`)),
    ];
    return heads.flatMap((head) => rest.map((tail) => `${head}${tail}`));
  };
  const read = (word: string): string => {
    const [best] = readings(word)
      .map((reading) => ({
        reading,
        count: uses.get(reading.toLowerCase()) ?? 0,
      }))
      .filter(({ count }) => count > 0)
      .sort((a, b) => b.count - a.count);
    return best?.reading ?? word;
  };
  return pages.map((page) => ({
    ...page,
    lines: page.lines.map((line) => ({
      ...line,
      text: line.text.replace(SMALL_E, read),
    })),
  }));
}

/** A signature opens so many letters alike on each page it closes. */
const SIGNATURE_LETTERS = 8;
/** A line closes this many pages alike, its sheet number aside, to be the printer's signature. */
const SIGNATURE_PAGES = 3;

/**
 * A signature names the book, author first and a comma after, and ends in
 * the sheet's number or the volume's numeral, a speck the OCR read after
 * it aside.
 */
const SHEET_SIGNATURE =
  /^\p{Lu}[\p{L}-]+, \S.*[ .,](?:\d{1,2}\*?|[IVXivxl]+\.?)(?: \S{1,3})?$/u;

/** A line's letters, in small type, without its figures and marks: a signature's, whatever its sheet. */
function signatureKey(text: string): string {
  if (!SHEET_SIGNATURE.test(text.trim())) return "";
  return (text.toLowerCase().match(/\p{L}/gu) ?? [])
    .join("")
    .slice(0, SIGNATURE_LETTERS);
}

/**
 * The pages without the printer's signature: the line at a sheet's foot
 * naming the book and counting its sheets, which closes several pages
 * alike but for its number.
 */
function withoutSignatures(pages: Page[]): Page[] {
  const lastOf = (page: Page): Line | undefined =>
    page.lines.reduce<Line | undefined>(
      (low, line) => (low === undefined || line.y > low.y ? line : low),
      undefined,
    );
  const counts = pages.reduce((seen, page) => {
    const key = signatureKey(lastOf(page)?.text ?? "");
    return key.length === SIGNATURE_LETTERS
      ? seen.set(key, (seen.get(key) ?? 0) + 1)
      : seen;
  }, new Map<string, number>());
  return pages.map((page) => {
    const last = lastOf(page);
    return last && (counts.get(signatureKey(last.text)) ?? 0) >= SIGNATURE_PAGES
      ? { ...page, lines: page.lines.filter((line) => line !== last) }
      : page;
  });
}

/** A full page holds this many pairs of words in turn at least. */
const RESCAN_PAIRS = 80;
/** A rescan shares this share of its pairs of words with the page it repeats, */
const RESCAN_SHARE = 0.75;
/** and follows it within this many leaves. */
const RESCAN_REACH = 20;

/** A page number read this long tells a page apart; a shorter one may be a longer one misread. */
const TELLING_HEAD = 100;

/**
 * The pages without those the scan holds twice: a full leaf that shares
 * most of its pairs of words with one shortly before it is a rescan, read
 * anew as it is, unless their heads number them apart, as an index's pages
 * alike in their words are.
 */
function withoutRescans(pages: Page[]): Page[] {
  const pairs = pages.map((page) => {
    const words = page.lines.flatMap(
      (line) => line.text.toLowerCase().match(/\p{L}{3,}/gu) ?? [],
    );
    return new Set(words.slice(1).map((word, at) => `${words[at]} ${word}`));
  });
  const heads = pages.map((page) => {
    const number = numberedHead(page)?.number ?? null;
    return number !== null && number >= TELLING_HEAD ? number : null;
  });
  const repeats = (index: number): boolean => {
    const own = pairs[index] ?? new Set<string>();
    if (own.size < RESCAN_PAIRS) return false;
    return pairs
      .slice(Math.max(0, index - RESCAN_REACH), index)
      .some((other, at) => {
        const earlier = Math.max(0, index - RESCAN_REACH) + at;
        const apart =
          heads[index] !== null &&
          heads[earlier] !== null &&
          heads[index] !== heads[earlier];
        return (
          !apart &&
          other.size >= RESCAN_PAIRS &&
          [...own].filter((pair) => other.has(pair)).length >=
            Math.min(own.size, other.size) * RESCAN_SHARE
        );
      });
  };
  return pages.filter((_page, index) => !repeats(index));
}

function readVolume(hocr: string): ReadVolume {
  const pages = withoutRescans(
    withoutSignatures(
      withUmlauts(withoutTopMargin(atOneScale(readPages(hocr)))),
    ),
  );
  const printed = printedPageNumbers(pages.map(readingOf));
  // The leaves before the first page are the front matter.
  const firstLeaf = Math.min(
    ...pages
      .filter((page) => (printed.get(page.leaf) ?? 0) >= 1)
      .map((page) => page.leaf),
  );
  const frontLeaves = new Set(
    pages.filter((page) => page.leaf < firstLeaf).map((page) => page.leaf),
  );
  const headOf = (page: Page): number =>
    Math.max(
      runningHeadIndex(page, heads, frontLeaves.has(page.leaf)),
      lowHeadIndex(page, printed.get(page.leaf) ?? null),
    );
  const fullLines = pages.flatMap((page) =>
    page.lines.filter((line) => line.width > page.width / 2),
  );
  const heads = pages.flatMap((page) => {
    const head = numberedHead(page);
    const line = head ? page.lines[head.index] : undefined;
    return line ? [new Set(headWords(line.text))] : [];
  });
  const spelling = createSpelling(
    pages.flatMap((page) => page.lines.map((line) => line.text)),
  );
  // The text alone spells the words; running heads repeat whatever the OCR
  // made of them.
  const textSpelling = createSpelling(
    pages.flatMap((page) =>
      page.lines.slice(headOf(page) + 1).map((line) => line.text),
    ),
  );
  const uses = pages
    .flatMap((page) =>
      page.lines
        .slice(headOf(page) + 1)
        .flatMap((line) => line.text.toLowerCase().match(/\p{L}{2,}/gu) ?? []),
    )
    .reduce(
      (seen, word) => seen.set(word, (seen.get(word) ?? 0) + 1),
      new Map<string, number>(),
    );
  return {
    pages,
    printed,
    volume: {
      frontLeaves,
      printed,
      // A numeral alone in the body, centred and narrow, opens a chapter; one
      // at the head is a page number, one at the edge the scan's noise, one
      // in the front matter its own.
      numberedTitles: !pages.some(
        (page) =>
          (printed.get(page.leaf) ?? 0) >= 1 &&
          page.lines.some(
            (line) =>
              LONE_NUMERAL.test(line.text) &&
              line.y > page.height * HEAD_ZONE &&
              line.width < page.width * NUMERAL_WIDTH &&
              Math.abs(line.x + line.width / 2 - middleOf(page)) <
                page.width * CENTRE,
          ),
      ),
      common: new Set(
        [...uses]
          .filter(([, count]) => count >= COMMON_USES)
          .map(([word]) => word),
      ),
      heads,
      column: median(fullLines.map((line) => line.width)),
      textSize: median(fullLines.map((line) => line.size)),
      spelling,
      textSpelling,
    },
    // Pages before the first are the front matter, numbered in roman.
    front: romanOffset(pages),
  };
}

/** The volume read last: a manifest lists a volume's works one after another. */
const lastRead: { hocr: string | null; volume: ReadVolume | null } = {
  hocr: null,
  volume: null,
};

function volumeOf(hocr: string): ReadVolume {
  if (lastRead.hocr !== hocr || lastRead.volume === null) {
    lastRead.volume = readVolume(hocr);
    lastRead.hocr = hocr;
  }
  return lastRead.volume;
}

/** The lines the manifest names as opening a printed page's paragraphs, if it names any there. */
function paragraphOpeningsOn(
  work: ArchiveOcrWork,
  label: string,
): { paragraphOpenings?: string[] } {
  const named = (work.paragraphs ?? []).filter(
    (line) => String(line.page) === label,
  );
  return named.length === 0
    ? {}
    : { paragraphOpenings: named.map((line) => line.opens) };
}

/** The lines the manifest names as opening a printed page's notes, if it names any there. */
function noteOpeningsOn(
  work: ArchiveOcrWork,
  label: string,
): { noteOpenings?: string[]; noteRunsOn?: string[] } {
  const named = (work.notes ?? []).filter(
    (line) => String(line.page) === label,
  );
  return named.length === 0
    ? {}
    : {
        noteOpenings: named.map((line) => line.opens),
        noteRunsOn: named
          .filter((line) => line.runsOn === true)
          .map((line) => line.opens),
      };
}

/** A work's first page from the line it opens with, if the manifest names one. */
function opened(
  page: Page,
  work: ArchiveOcrWork,
  label: string,
): { page: Page; corrections: OcrCorrection[] } {
  const corrections = work.corrections ?? [];
  const opening = work.opensWith;
  if (opening === undefined) return { page, corrections };
  const own = corrections.filter(
    (correction) => String(correction.page) === label,
  );
  // The page's lines as its corrections leave them, each fixing the first
  // line that holds its text, what an earlier one wrote too: the line the
  // work opens with is read so or as the scan has it, which a correction
  // may set right or leave out, as it does a title the manifest gives.
  const lines = page.lines.map((line) => normalised(line.text));
  const { fixed, touched } = own.reduce<{
    fixed: string[];
    touched: Map<OcrCorrection, number>;
  }>(
    (done, correction) => {
      const line = done.fixed.findIndex((each) =>
        each.includes(correction.from),
      );
      return line < 0
        ? done
        : {
            fixed: done.fixed.map((each, index) =>
              index === line
                ? each.replace(correction.from, correction.to)
                : each,
            ),
            touched: new Map([...done.touched, [correction, line]]),
          };
    },
    { fixed: lines, touched: new Map() },
  );
  const at = fixed.findIndex(
    (line, index) =>
      line.startsWith(opening) || (lines[index] ?? "").startsWith(opening),
  );
  if (at < 0) {
    throw new Error(`No line opening "${opening}" on page ${work.firstPage}`);
  }
  // A correction to a line above the opening fixes a line the work leaves
  // out, unless a line of the work holds its text too.
  const outside = own.filter(
    (correction) =>
      (touched.get(correction) ?? at) < at &&
      !lines.slice(at).some((line) => line.includes(correction.from)),
  );
  return {
    page: { ...page, lines: page.lines.slice(at) },
    corrections: corrections.filter(
      (correction) => !outside.includes(correction),
    ),
  };
}

/** A gloss starts this share of the page's width left of the text column. */
const MARGIN = 0.04;

/**
 * A page without the glosses its edition sets in the margin: the words a
 * line opens with left of the text column, and the lines set wholly there.
 */
function withoutMarginalia(page: Page): Page {
  const column = median(
    page.lines
      .filter((line) => line.width > page.width / 2)
      .map((line) => line.x),
  );
  const edge = column - page.width * MARGIN;
  return {
    ...page,
    lines: page.lines.flatMap((line): Line[] => {
      const words = line.text.split(" ");
      const starts = line.starts ?? [];
      const glossed = starts.findIndex((start) => start >= edge);
      // A line set wholly in the margin is a gloss.
      if (line.x < edge && line.x + line.width <= column && glossed <= 0) {
        return glossed === 0 ? [line] : [];
      }
      // The words the OCR ran on from a gloss into the line.
      if (glossed > 0 && starts.length === words.length) {
        const x = starts[glossed] ?? line.x;
        return [
          {
            ...line,
            x,
            width: line.x + line.width - x,
            text: words.slice(glossed).join(" "),
            starts: starts.slice(glossed),
          },
        ];
      }
      return [line];
    }),
  };
}

/**
 * Parse a work from a scanned volume's hOCR: its parts, chapters and
 * subsections by their headings, paragraphs by first-line indent across
 * pages, the author's footnotes kept as notes. A long section is split at
 * paragraphs into parts, each cited from the page it starts on and carrying
 * the notes of its pages. Running heads, printer's signatures, rules, the
 * scan's noise and pages outside the work are left out.
 */
export function parseArchiveOcrWork(
  hocr: string,
  work: ArchiveOcrWork,
  options: ArchiveOcrOptions = {},
): BookUnit[] {
  const read = volumeOf(hocr);
  const volume = {
    ...read.volume,
    spacedNotes: work.spacedNotes === true,
    curved: work.curved === true,
    datelined: work.datelined === true,
  };
  const { cased } = volume.spelling;
  const pagesRead = pagesOfWork(read, work).map(
    ({ page, number, label }, index) => {
      const first =
        index === 0
          ? opened(page, work, label)
          : { page, corrections: work.corrections ?? [] };
      const own = (
        work.marginalia === true
          ? withoutMarginalia
          : (same: Page): Page => same
      )(first.page);
      return {
        page: own,
        number,
        label,
        read: readPage(
          own,
          {
            ...volume,
            headingOpenings: (work.headings ?? [])
              .filter((heading) => String(heading.page) === label)
              .map(({ opens, numeral, level, label: printed }) => ({
                opens,
                ...(numeral === undefined ? {} : { numeral }),
                ...(level === undefined ? {} : { level }),
                ...(printed === undefined ? {} : { label: printed }),
              })),
            ...paragraphOpeningsOn(work, label),
            ...noteOpeningsOn(work, label),
          },
          first.corrections,
          label,
        ),
      };
    },
  );
  // The running heads as corrected, which a title may stand in for.
  const headsByLeaf = new Map(
    pagesRead.flatMap(
      ({ page, read: { head } }): Array<[number, RunningHead]> =>
        head === null ? [] : [[page.leaf, head]],
    ),
  );
  const { sections } = pagesRead.reduce<WorkState>(
    (state, { page, number, label, read: { pieces } }) =>
      pieces.reduce<WorkState>(
        (done, piece) =>
          piece.kind === "heading"
            ? addHeading(
                done,
                headingOf(piece.lines),
                cased,
                {
                  page: number,
                  leaf: page.leaf,
                  label,
                },
                work.title,
                work.skipHeadings ?? [],
              )
            : addPiece(done, piece, {
                page: number,
                leaf: page.leaf,
                label,
              }),
        state,
      ),
    {
      sections: [],
      chapters: (work.firstChapter ?? 1) - 1,
      skipping: null,
    },
  );

  const filled = sections.filter((section) => section.paragraphs.length > 0);
  const cite = (start: Block): { citation: string; source: string } => ({
    citation: `${work.citation}, ${start.label}`,
    source:
      work.scan?.pages[start.leaf] ??
      `https://archive.org/details/${work.item}/page/n${start.leaf}`,
  });
  const steps = [...new Set(filled.flatMap((section) => section.path))];
  // A title is spelled as the running text spells it, its misread type too.
  const running = filled
    .flatMap((section) => section.paragraphs)
    .flatMap((block) => block.text.toLowerCase().match(/\p{L}+/gu) ?? [])
    .reduce(
      (tally, word) => tally.set(word, (tally.get(word) ?? 0) + 1),
      new Map<string, number>(),
    );
  const uses = (word: string): number => running.get(word.toLowerCase()) ?? 0;
  const titles = new Map(
    steps.map((step) => [
      step,
      titleOf(
        step,
        retitled(
          namedByHeads(step, filled, headsByLeaf, volume.textSpelling),
          uses,
        ),
      ),
    ]),
  );
  // A ß the OCR read as B is read as ß again, words it ran together in
  // letter-spaced type are parted, and brackets it read as marks close.
  const parted = <Block extends { text: string }>(blocks: Block[]): Block[] =>
    blocks.map((block) => ({
      ...block,
      text: unjoined(
        sharpened(closedBrackets(block.text), volume.common),
        volume.common,
      ),
    }));
  const skipNotes = work.skipNotes ?? [];
  // A signature closes a note after a stop or space, not inside a word.
  const signed = (work.skipNotesSigned ?? []).map(
    (signature) =>
      new RegExp(`(?:^|[^\\p{Ll}])${RegExp.escape(signature)}$`, "u"),
  );
  const skipped = (note: Block): boolean =>
    signed.some((signature) => signature.test(note.text.trim())) ||
    skipNotes.some(
      (skip) =>
        String(skip.page) === note.label && note.text.startsWith(skip.opens),
    );
  // A note left out that names no note is stale.
  skipNotes.forEach((skip) => {
    const found = filled.some((section) =>
      section.notes.some(
        (note) =>
          String(skip.page) === note.label && note.text.startsWith(skip.opens),
      ),
    );
    if (!found) {
      throw new Error(
        `No note "${skip.opens}" on page ${String(skip.page)} to leave out`,
      );
    }
  });
  return unitsOfSections(
    filled.map((section) => ({
      ...section,
      // A signed note the page set as text is the editor's too.
      paragraphs: tabled(
        parted(
          section.paragraphs.filter(
            (paragraph) =>
              !signed.some((signature) =>
                signature.test(paragraph.text.trim()),
              ),
          ),
        ),
      ),
      notes: parted(section.notes.filter((note) => !skipped(note))),
      titles: section.path.map((step) => titles.get(step) ?? ""),
    })),
    cite,
    options.entryBytes,
  );
}
