import { Window } from "happy-dom";
import type { BookUnit } from "../render-book";
import { unitsOfSections } from "../sections";
import { sharpened, unjoined } from "./run-together";
import {
  createSpelling,
  headingLineOf,
  headingOf,
  SECTION_NAME,
  isWordy,
  namesTitle,
  sameName,
  type Spelling,
  type Heading,
  type HeadingLine,
} from "./archive-ocr-headings";

/** A misread line fixed: on a printed page, its text from, as the reader reads it, to the right one. */
export interface OcrCorrection {
  page: number | string;
  from: string;
  to: string;
}

/** A work inside a scanned volume, by its printed pages. */
export interface ArchiveOcrWork {
  /** The archive.org item, e.g. `freud-1940-gw-13`. */
  item: string;
  /** The work's title, which its opening heading may print. */
  title: string;
  /** How a citation names the volume before its page: GW XIII. */
  citation: string;
  /** A printed page, or a roman page of the front matter. */
  firstPage: number | string;
  lastPage: number;
  /** Pages in the range that are not the author's, such as an editors' note. */
  skipPages?: number[];
  /** Sections to leave out by their headings, such as a piece in another language. */
  skipHeadings?: string[];
  /** The number of the work's first chapter, where it goes on from another. */
  firstChapter?: number;
  /** Lines the OCR misread, fixed. */
  corrections?: OcrCorrection[];
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
}

interface Page {
  /** The scan leaf, as archive.org numbers its pages. */
  leaf: number;
  width: number;
  height: number;
  lines: Line[];
}

const LINE_SELECTOR = ".ocr_line, .ocr_header, .ocr_caption, .ocr_textfloat";

/** Footnotes are set smaller than the text, at most this share of its size. */
const NOTE_SIZE = 0.8;
/** Running heads sit in the top tenth of the page, */
const HEAD_ZONE = 0.1;
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
/** A line of several tokens and no word among them: a rule read as letters. */
function isScraps(text: string): boolean {
  return !/\p{L}{3}/u.test(text) && text.split(" ").length >= SCRAP_TOKENS;
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
/** The printer's signature at a sheet's foot, its numeral however misread. */
const SIGNATURE = /^Freud\s*[,.]?\s*[IVXLl1|]+\.?\s*\d*\s*$/;
const NOTE_START = /^(?:ı|\d+|\*)\)/;
/** The OCR reads the superscript note marker 1) as a dotless i. */
const OCR_NOTE_MARKER = /ı\)/g;

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
          },
        ];
      }
      return [...joined, line];
    }, []);
}

/** Letters mostly in capitals, off the centre: the facing page's edge. */
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
              // A stray mark beside the line would move its edges; its words
              // of letters and digits place it.
              const words = Array.from(element.querySelectorAll(".ocrx_word"))
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
                text: element.textContent.replace(/\s+/g, " ").trim(),
              };
            })
            .filter((line) => line.text.length > 0),
        );
        return {
          leaf: Number(/(\d+)$/.exec(page?.id ?? "")?.[1] ?? Number.NaN),
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

/** The page's running head that carries its page number, and where it stands. */
function numberedHead(page: Page): { index: number; number: number } | null {
  return page.lines.reduce<{ index: number; number: number } | null>(
    (found, line, index) => {
      if (found || index >= HEAD_LINES || line.y > page.height * HEAD_ZONE) {
        return found;
      }
      // The OCR reads a 1 in a page number as a dotless i.
      const match = RUNNING_HEAD.exec(
        line.text.replace(/(?<=\d)ı|ı(?=\d)/g, "1"),
      );
      const number = match?.[1] ?? match?.[2] ?? match?.[3];
      return number === undefined ? null : { index, number: Number(number) };
    },
    null,
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
  return numberedHead(page)?.number ?? null;
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
  // head ends with the later of them.
  return Math.max(numbered?.index ?? -1, titledHeadIndex(page, heads));
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
  /** Words of running text; a plate's picture reads as next to none. */
  words: number;
}

/** A running head's number counts when a head this close by agrees with it. */
const CONFIRM_LEAVES = 4;

interface Anchor {
  leaf: number;
  offset: number;
}

/** A scan missing a leaf or two raises the offset that much. */
const MISSING_LEAVES = 2;
/** Plates bound in one place lower the offset by at most this many leaves. */
const PLATE_LEAVES = 8;

/** Anchors in runs of one offset, in reading order. */
function runsOf(anchors: Anchor[]): Anchor[][] {
  return anchors.reduce<Anchor[][]>((runs, anchor) => {
    const last = runs.at(-1);
    return last?.[0]?.offset === anchor.offset
      ? [...runs.slice(0, -1), [...last, anchor]]
      : [...runs, [anchor]];
  }, []);
}

/** Whether one run of heads can follow another in the same volume. */
function follows(before: Anchor[], after: Anchor[]): boolean {
  const drop = (before[0]?.offset ?? 0) - (after[0]?.offset ?? 0);
  return drop >= -MISSING_LEAVES && drop <= PLATE_LEAVES;
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
function withoutMisreadRuns(anchors: Anchor[]): Anchor[] {
  const runs = runsOf(anchors);
  const chains = runs.reduce<Chain[]>((done, run) => {
    const best = done.reduce<Chain>(
      (found, chain, at) =>
        follows(runs[at] ?? [], run) && chain.weight + run.length > found.weight
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
 * in between take the leaves that read least and get no number; the other
 * leaves are numbered on from the first anchor.
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
  const plateCount = Math.max(0, to.leaf - from.leaf - 1 - pages);
  const plates = new Set(
    [...gap]
      .sort((a, b) => a.words - b.words || a.leaf - b.leaf)
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
      : [{ leaf: reading.leaf, offset: reading.head - reading.leaf }],
  );
  const anchors = withoutMisreadRuns(
    heads.filter((head) =>
      heads.some(
        (other) =>
          other !== head &&
          other.offset === head.offset &&
          Math.abs(other.leaf - head.leaf) <= CONFIRM_LEAVES,
      ),
    ),
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
    words: page.lines.reduce(
      (sum, line) => sum + (line.text.match(WORD)?.length ?? 0),
      0,
    ),
  };
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)] ?? 0;
}

type Piece =
  | { kind: "heading"; lines: HeadingLine[]; closed?: boolean }
  | { kind: "text"; text: string; opens: boolean }
  | { kind: "note"; text: string; opens: boolean };

/** What reading a page needs to know about its volume. */
interface Volume {
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
  /** Each page's running head, without its page number or numeral. */
  headsByLeaf: Map<number, string>;
  /** The words its text uses often, in small letters. */
  common: Set<string>;
  /** The leaves before its first page: front matter, numbered in roman. */
  frontLeaves: Set<number>;
  /** Whether it sets a chapter's numeral and title on one line, never a numeral alone. */
  numberedTitles: boolean;
}

/** Lines below the running head and the scan's noise above it. */
function bodyLines(page: Page, volume: Volume): Line[] {
  return page.lines.slice(
    runningHeadIndex(page, volume.heads, volume.frontLeaves.has(page.leaf)) + 1,
  );
}

/** A token that reads as a word of three letters or more, with its punctuation. */
const WORDLIKE = /^[„“"‚‘'(»«]*\p{L}{3,}[\p{L}-]*[.,;:!?“"'’)»«]*$/u;

/** A line mostly of words: text or a heading, not a picture's scraps. */
function isClean(line: Line): boolean {
  const tokens = line.text.split(" ");
  return (
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

/**
 * One page read as heading blocks, text lines and note lines, in order. A
 * heading is a run of short centred lines: a numeral, a letter, a part's name,
 * lines in capitals, a qualifier in brackets.
 */
/** The OCR reads a note marker, a 1 beside digits, and an i, as a dotless i. */
function normalised(text: string): string {
  return (
    text
      // A dot the OCR set before a word inside the line is a speck.
      .replace(/(?<=\s)\.(?=\p{Ll})/gu, "")
      .replace(OCR_NOTE_MARKER, "¹)")
      .replace(/(?<=\d)ı|ı(?=\d)/g, "1")
      .replace(/ı/g, "i")
  );
}

/** A heading's line as printed, for reading a page against its scan. */
function headingLineText(line: HeadingLine): string {
  switch (line.kind) {
    case "chapter":
      return line.numeral;
    case "letter":
      return line.letter;
    default:
      return line.text;
  }
}

/** The scan leaf a printed page is on. */
export function pageLeaf(hocr: string, printedPage: number): number {
  const { pages, printed } = volumeOf(hocr);
  const page = pages.find((each) => printed.get(each.leaf) === printedPage);
  if (!page) throw new Error(`No page ${printedPage}`);
  return page.leaf;
}

/**
 * One printed page's text as the importer reads it, line by line, headings
 * and notes included: what an OCR check holds against the scan.
 */
export function pageText(
  hocr: string,
  printedPage: number,
  corrections: OcrCorrection[] = [],
): string {
  const { pages, volume } = volumeOf(hocr);
  const leaf = pageLeaf(hocr, printedPage);
  const page = pages.find((each) => each.leaf === leaf);
  if (!page) throw new Error(`No page ${printedPage}`);
  return readPage(page, volume, corrections, String(printedPage))
    .flatMap((piece) =>
      piece.kind === "heading"
        ? piece.lines.map(headingLineText)
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
      return [text === lines[index] ? line : { ...line, text }];
    }),
  };
}

/**
 * A page read into pieces with its corrections. A correction whose text is
 * a whole line of the scan fixes that line before the page is read, so a
 * misread heading can be set right; any other fixes the text where it holds
 * it, else the scan's line that holds it. A correction that finds nothing to
 * fix is stale.
 */
function readPage(
  page: Page,
  volume: Volume,
  corrections: OcrCorrection[],
  label: string,
): Piece[] {
  const own = corrections.filter(
    (correction) => String(correction.page) === label,
  );
  const lines = page.lines.map((line) => normalised(line.text));
  const whole = own.filter((correction) => lines.includes(correction.from));
  const lined = correctedLines(page, whole, label);
  const rest = own.filter((correction) => !whole.includes(correction));
  const pieces = piecesOf(lined, volume);
  const texts = pieces.flatMap((piece) =>
    piece.kind === "heading" ? [] : [normalised(piece.text)],
  );
  const inScan = rest.filter(
    (correction) => !texts.some((text) => text.includes(correction.from)),
  );
  return correctedPieces(
    inScan.length === 0
      ? pieces
      : piecesOf(correctedLines(lined, inScan, label), volume),
    rest.filter((correction) => !inScan.includes(correction)),
    label,
  );
}

/** No chapter opens below this share of the page's height. */
const FOOT_ZONE = 0.85;
/** A chapter's numeral alone is narrower than this share of the page. */
const NUMERAL_WIDTH = 0.1;
/** A numeral set on a line of its own. */
const LONE_NUMERAL = /^[IVXL]+\.?$/u;
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
    Math.abs(line.x + line.width / 2 - page.width / 2) < page.width * CENTRE;
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
  return [
    { ...line, text: match[1], numbered: true },
    { ...line, text: match[2], ends: true, numbered: true },
  ];
}

function piecesOf(page: Page, volume: Volume): Piece[] {
  const headless = volume.numberedTitles
    ? bodyLines(page, volume).flatMap((line) =>
        numberedTitleApart(line, page, volume),
      )
    : bodyLines(page, volume);
  if (isPicture(headless)) return [];
  const bodySize = median(headless.map((line) => line.size));
  const bodyHeight = median(headless.map((line) => line.bottom - line.y));
  // The footnotes open the page's foot: at the rule above them, or at a small
  // line that starts with a note marker. Everything below is notes; measured
  // sizes alone mistake a body line low on a curved page for one.
  const footAt = headless.findIndex(
    (line) =>
      line.y > page.height / 2 &&
      (!/[\p{L}\d]/u.test(line.text) ||
        (line.size < bodySize * NOTE_SIZE && NOTE_START.test(line.text))),
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
  return headless.reduce<Piece[]>((pieces, line, index) => {
    if (index >= noteFrom) {
      if (
        !/\p{L}/u.test(line.text) ||
        SIGNATURE.test(line.text) ||
        isEdgeNoise(line.text) ||
        isScraps(line.text)
      ) {
        return pieces;
      }
      return [
        ...pieces,
        { kind: "note", text: line.text, opens: NOTE_START.test(line.text) },
      ];
    }
    const centre = line.x + line.width / 2;
    const last = pieces.at(-1);
    // A heading runs on until a line ends it.
    const open = last?.kind === "heading" && last.closed !== true;
    // A heading opens with a short or large centred line; once open, it runs
    // on through centred lines however wide.
    const centred =
      Math.abs(centre - page.width / 2) < page.width * CENTRE &&
      // A running head is no section's bare name, nor a numeral with a title.
      (line.y > page.height * HEAD_ZONE ||
        line.numbered === true ||
        SECTION_NAME.test(line.text.trim())) &&
      (open ||
        line.width < volume.column * HEADING_WIDTH ||
        line.size > volume.textSize * HEADING_SIZE);
    const read = centred ? headingLineOf(line.text, line.size) : null;
    // The line after a numeral, letter or part's name is its title, even where
    // the OCR read its capitals as small letters, or set in display type
    // across the column.
    const above = open ? last.lines.at(-1) : undefined;
    const titles =
      above !== undefined &&
      (above.kind === "part" ||
        above.kind === "chapter" ||
        above.kind === "letter" ||
        (above.kind === "caps" && above.misread === true)) &&
      (line.width < volume.column * TITLE_WIDTH ||
        line.size > volume.textSize * HEADING_SIZE);
    // A title set in display type, larger than the text, need not be in
    // capitals; Fraktur's display type has none to read.
    // Two text lines the OCR read as one are as large, but fill the column.
    const display =
      line.size > volume.textSize * DISPLAY_SIZE &&
      line.bottom - line.y > bodyHeight * DISPLAY_HEIGHT &&
      line.width < volume.column * HEADING_WIDTH;
    const candidate: HeadingLine | null =
      read ??
      (centred && (titles || display)
        ? { kind: "caps", text: line.text, size: line.size, misread: true }
        : null);
    // A title is made of the work's words; a picture's scraps are not.
    const headingLine =
      candidate?.kind === "caps" &&
      !SECTION_NAME.test(candidate.text) &&
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
          : [...pieces, { kind: "heading", lines: [headingLine], closed }];
      }
    }
    if (SIGNATURE.test(line.text) || isEdgeNoise(line.text)) return pieces;
    // Scraps without a word, away from the margin or several of them, are
    // marks on the scan, such as a rule read as letters; not a line's end.
    if (
      !/\p{L}{3}/u.test(line.text) &&
      (Math.abs(line.x - margin) > page.width * INDENT || isScraps(line.text))
    ) {
      return pieces;
    }
    return [
      ...pieces,
      {
        kind: "text",
        text: line.text,
        opens: line.x - margin > page.width * INDENT,
      },
    ];
  }, []);
}

/**
 * Join a line onto the text before it. A word broken at the line end loses
 * its hyphen when it continues in lower case; a capitalised continuation is a
 * compound and keeps it. The OCR sometimes reads the break as a stray dot.
 */
function joinLine(before: string, line: string): string {
  if (before.length === 0) return line;
  if (/\p{L}-$/u.test(before)) {
    const rest = line.replace(/^[.·,'’]+/, "");
    return /^\p{Ll}/u.test(rest) ? before.slice(0, -1) + rest : before + rest;
  }
  return `${before} ${line}`;
}

/** A paragraph or note, and where its text starts. */
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
  return opens || last === undefined
    ? [...blocks, { text: line, ...place, lastLeaf: place.leaf }]
    : [
        ...blocks.slice(0, -1),
        { ...last, text: joinLine(last.text, line), lastLeaf: place.leaf },
      ];
}

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
  /** Inside a section the manifest leaves out, up to the next heading. */
  skipping: boolean;
}

/** A heading's title in the work, its words cased as the text spells them. */
/** A heading as titled: its label, its name, and qualifiers after them. */
function titleOf(step: PathStep, name: string = step.name): string {
  const named = [step.label, name].filter(
    (part): part is string => part !== null && part !== "",
  );
  return [named.join(". "), ...step.qualifiers].join(" ");
}

/**
 * A heading's level: an unnumbered one stands below an open numbered
 * chapter, and beside other unnumbered ones.
 */
function levelOf(heading: Heading, path: PathStep[]): number {
  if (heading.level !== null) return heading.level;
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
    (heading.title.length === 0 || heading.misread) &&
    path.some((step) => step.level === 2)
  ) {
    return heading.title.reduce<WorkState>(
      (done, line) =>
        addPiece(done, { kind: "text", text: line, opens: true }, place),
      state,
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
  const chapters = state.chapters + (heading.numbered ? 1 : 0);
  // A section left out still holds its place among the chapters.
  if (skip.some((title) => namesTitle(heading.title.join(" "), title))) {
    return { ...state, chapters, skipping: true };
  }
  const level = levelOf(heading, path);
  const step = {
    level,
    label: heading.numbered
      ? roman(chapters)
      : heading.label === null
        ? null
        : cased(heading.label),
    name: heading.title.map(cased).join(". "),
    qualifiers: heading.qualifiers,
    letter: level === 2 ? heading.label : null,
    numbered: heading.numbered,
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
    skipping: false,
  };
}

function addPiece(
  state: WorkState,
  piece: Exclude<Piece, { kind: "heading" }>,
  place: Place,
): WorkState {
  if (state.skipping) return state;
  const current = state.sections.at(-1) ?? {
    path: [],
    paragraphs: [],
    notes: [],
  };
  const rest = state.sections.length > 0 ? state.sections.slice(0, -1) : [];
  const text = normalised(piece.text);
  const section =
    piece.kind === "note"
      ? { ...current, notes: addLine(current.notes, text, piece.opens, place) }
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
 * A heading's name as its running heads print it, where they do: in proper
 * case, which the capitals of the heading cannot tell. The head printed most
 * often over the heading's pages, and naming the same thing, wins unless the
 * OCR misread it where it read the heading right: the work's text must know
 * its words as well as the heading's own.
 */
function namedByHeads(
  step: PathStep,
  sections: Section[],
  volume: Volume,
): string {
  const { headsByLeaf, textSpelling: spelling } = volume;
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
      return head !== undefined && sameName(head, step.name) ? [head] : [];
    });
  const counts = heads.reduce(
    (tally, head) => tally.set(head, (tally.get(head) ?? 0) + 1),
    new Map<string, number>(),
  );
  const head = [...counts].sort(
    (a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1),
  )[0]?.[0];
  return head !== undefined &&
    knownShare(head, spelling) >= knownShare(step.name, spelling)
    ? head
    : step.name;
}

/** A volume as read once for all the works it holds. */
interface ReadVolume {
  pages: Page[];
  printed: Map<number, number | null>;
  volume: Volume;
  /** The front matter's roman offset, if it has roman heads. */
  front: number | null;
}

function readVolume(hocr: string): ReadVolume {
  const pages = readPages(hocr);
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
    runningHeadIndex(page, heads, frontLeaves.has(page.leaf));
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
              Math.abs(line.x + line.width / 2 - page.width / 2) <
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
      headsByLeaf: new Map(
        pages.flatMap((page): Array<[number, string]> => {
          const line = page.lines[headOf(page)];
          return line ? [[page.leaf, headName(line.text)]] : [];
        }),
      ),
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
  const { pages, printed, volume, front } = volumeOf(hocr);
  const { cased } = volume.spelling;
  const labelOf = (number: number, leaf: number): string =>
    number < 1 && front !== null ? roman(leaf + front) : String(number);
  const firstPage =
    typeof work.firstPage === "number"
      ? work.firstPage
      : front === null
        ? null
        : (printed.get(romanValue(work.firstPage) - front) ?? null);
  if (firstPage === null) {
    throw new Error(`No page ${work.firstPage} in ${work.item}`);
  }
  const { sections } = pages
    .flatMap((page) => {
      const number = printed.get(page.leaf) ?? null;
      return number !== null &&
        number >= firstPage &&
        number <= work.lastPage &&
        !(work.skipPages ?? []).includes(number)
        ? [{ page, number }]
        : [];
    })
    .reduce<WorkState>(
      (state, { page, number }) =>
        readPage(
          page,
          volume,
          work.corrections ?? [],
          labelOf(number, page.leaf),
        ).reduce<WorkState>(
          (done, piece) =>
            piece.kind === "heading"
              ? addHeading(
                  done,
                  headingOf(piece.lines),
                  cased,
                  {
                    page: number,
                    leaf: page.leaf,
                    label: labelOf(number, page.leaf),
                  },
                  work.title,
                  work.skipHeadings ?? [],
                )
              : addPiece(done, piece, {
                  page: number,
                  leaf: page.leaf,
                  label: labelOf(number, page.leaf),
                }),
          state,
        ),
      {
        sections: [],
        chapters: (work.firstChapter ?? 1) - 1,
        skipping: false,
      },
    );

  const filled = sections.filter((section) => section.paragraphs.length > 0);
  const steps = [...new Set(filled.flatMap((section) => section.path))];
  const titles = new Map(
    steps.map((step) => [
      step,
      titleOf(step, namedByHeads(step, filled, volume)),
    ]),
  );
  // A ß the OCR read as B is read as ß again, and words it ran together in
  // letter-spaced type are parted.
  const parted = <Block extends { text: string }>(blocks: Block[]): Block[] =>
    blocks.map((block) => ({
      ...block,
      text: unjoined(sharpened(block.text, volume.common), volume.common),
    }));
  return unitsOfSections(
    filled.map((section) => ({
      ...section,
      paragraphs: parted(section.paragraphs),
      notes: parted(section.notes),
      titles: section.path.map((step) => titles.get(step) ?? ""),
    })),
    (start) => ({
      citation: `${work.citation}, ${start.label}`,
      source: `https://archive.org/details/${work.item}/page/n${start.leaf}`,
    }),
    options.entryBytes,
  );
}
