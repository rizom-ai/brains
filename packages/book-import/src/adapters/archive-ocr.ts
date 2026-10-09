import { Window } from "happy-dom";
import type { BookUnit } from "../render-book";
import {
  createCaser,
  headingLineOf,
  headingOf,
  namesTitle,
  type Heading,
  type HeadingLine,
} from "./archive-ocr-headings";

/** A work inside a scanned volume, by its printed pages. */
export interface ArchiveOcrWork {
  /** The archive.org item, e.g. `freud-1940-gw-13`. */
  item: string;
  /** The work's title, which its opening heading may print. */
  title: string;
  /** The volume's roman numeral, as citations name it. */
  volume: string;
  firstPage: number;
  lastPage: number;
  /** Pages in the range that are not the author's, such as an editors' note. */
  skipPages?: number[];
}

interface Line {
  x: number;
  y: number;
  bottom: number;
  width: number;
  size: number;
  text: string;
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
/** A title the OCR misread is at most this share of the text column. */
const TITLE_WIDTH = 0.75;
/** A page whose lines are mostly not words holds a picture, not text. */
const CLEAN_LINES = 0.5;

/** A page number opening or closing the line, past a scrap of OCR noise. */
const RUNNING_HEAD =
  /^(?:\S{1,2}\s+)?(\d+)\s+\S.*$|^.*\S\s+(\d+)(?:\s+\S{1,2})?$/;
const SIGNATURE = /^Freud,?\s+[IVXL]+\.?\s*\d*\s*$/;
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
      const number = match?.[1] ?? match?.[2];
      return number === undefined ? null : { index, number: Number(number) };
    },
    null,
  );
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
function runningHeadIndex(page: Page, heads: Array<Set<string>>): number {
  const numbered = numberedHead(page);
  if (numbered) return numbered.index;
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

/** So few agreeing heads can be one misreading repeated, as 355 and 358 for 335 and 338. */
const SHORT_RUN = 3;

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
 * Plates only ever lower the offset between leaf and page. A short run of
 * heads that raises it, or that differs from the runs on both its sides
 * where those agree, is the OCR misreading the same digit twice.
 */
function withoutMisreadRuns(anchors: Anchor[]): Anchor[] {
  const runs = runsOf(anchors);
  return runs
    .reduce<Anchor[][]>((kept, run, index) => {
      const offset = run[0]?.offset ?? 0;
      const before = kept.at(-1)?.[0]?.offset;
      const after = runs[index + 1]?.[0]?.offset;
      const misread =
        run.length < SHORT_RUN &&
        before !== undefined &&
        offset !== before &&
        (offset > before || before === after);
      return misread ? kept : [...kept, run];
    }, [])
    .flat();
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
  | { kind: "heading"; lines: HeadingLine[] }
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
}

/** Lines below the running head and the scan's noise above it. */
function bodyLines(page: Page, volume: Volume): Line[] {
  return page.lines.slice(runningHeadIndex(page, volume.heads) + 1);
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
function piecesOf(page: Page, volume: Volume): Piece[] {
  const headless = bodyLines(page, volume);
  if (isPicture(headless)) return [];
  const bodySize = median(headless.map((line) => line.size));
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
        isEdgeNoise(line.text)
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
    // A heading opens with a short or large centred line; once open, it runs
    // on through centred lines however wide.
    const centred =
      Math.abs(centre - page.width / 2) < page.width * CENTRE &&
      line.y > page.height * HEAD_ZONE &&
      (last?.kind === "heading" ||
        line.width < volume.column * HEADING_WIDTH ||
        line.size > volume.textSize * HEADING_SIZE);
    const read = centred ? headingLineOf(line.text, line.size) : null;
    // The line after a numeral, letter or part's name is its title, even where
    // the OCR read its capitals as small letters.
    const above = last?.kind === "heading" ? last.lines.at(-1) : undefined;
    const titles =
      above !== undefined &&
      (above.kind === "part" ||
        above.kind === "chapter" ||
        above.kind === "letter" ||
        (above.kind === "caps" && above.misread === true)) &&
      line.width < volume.column * TITLE_WIDTH;
    const headingLine: HeadingLine | null =
      read ??
      (centred && titles
        ? { kind: "caps", text: line.text, size: line.size, misread: true }
        : null);
    if (headingLine) {
      // A qualifier only qualifies a heading; alone it is running text.
      if (headingLine.kind !== "qualifier" || last?.kind === "heading") {
        // A numeral, letter or part's name opens the next heading.
        const continues =
          last?.kind === "heading" &&
          (headingLine.kind === "caps" ||
            headingLine.kind === "qualifier" ||
            last.lines.every((above) => above.kind === "qualifier"));
        return continues
          ? [
              ...pieces.slice(0, -1),
              { kind: "heading", lines: [...last.lines, headingLine] },
            ]
          : [...pieces, { kind: "heading", lines: [headingLine] }];
      }
    }
    if (SIGNATURE.test(line.text) || isEdgeNoise(line.text)) return pieces;
    // Scraps away from the margin are marks on the scan, not a line's end.
    if (
      !/\p{L}{3}/u.test(line.text) &&
      Math.abs(line.x - margin) > page.width * INDENT
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
}

interface Place {
  page: number;
  leaf: number;
}

function addLine(
  blocks: Block[],
  line: string,
  opens: boolean,
  place: Place,
): Block[] {
  const last = blocks.at(-1);
  return opens || last === undefined
    ? [...blocks, { text: line, ...place }]
    : [...blocks.slice(0, -1), { ...last, text: joinLine(last.text, line) }];
}

/** A heading as it stands in the work: its level and its cased title. */
interface PathStep {
  level: number;
  title: string;
  /** A subsection's letter. */
  letter: string | null;
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
  /** Whether the work's own title, its first unnumbered heading, has passed. */
  titled: boolean;
}

/** A heading's title in the work, its words cased as the text spells them. */
function titleOf(
  heading: Heading,
  place: number,
  cased: (capitals: string) => string,
): string {
  const label = heading.numbered
    ? roman(place)
    : heading.label === null
      ? null
      : cased(heading.label);
  const title = heading.title.map(cased).join(". ");
  const named = [label, title].filter((part) => part !== null && part !== "");
  return [named.join(". "), ...heading.qualifiers].join(" ");
}

/** A heading's level: an unnumbered one stands below an open chapter. */
function levelOf(heading: Heading, path: PathStep[]): number {
  if (heading.level !== null) return heading.level;
  return path.some((step) => step.level === 1) ? 2 : 1;
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
  const opening = state.sections.every(
    (section) => section.paragraphs.length === 0,
  );
  // The work opens with its own title, which the manifest already gives.
  if (
    opening &&
    !state.titled &&
    heading.level === null &&
    namesTitle(heading.title.join(" "), workTitle)
  ) {
    return { ...state, titled: true };
  }
  const chapters = state.chapters + (heading.numbered ? 1 : 0);
  const level = levelOf(heading, path);
  const step = {
    level,
    title: titleOf(heading, chapters, cased),
    letter: level === 2 ? heading.label : null,
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
    titled: true,
  };
}

function addPiece(
  state: WorkState,
  piece: Exclude<Piece, { kind: "heading" }>,
  place: Place,
): WorkState {
  const current = state.sections.at(-1) ?? {
    path: [],
    paragraphs: [],
    notes: [],
  };
  const rest = state.sections.length > 0 ? state.sections.slice(0, -1) : [];
  // The OCR reads a 1 beside digits, and an i, as a dotless i.
  const text = piece.text
    .replace(OCR_NOTE_MARKER, "¹)")
    .replace(/(?<=\d)ı|ı(?=\d)/g, "1")
    .replace(/ı/g, "i");
  const section =
    piece.kind === "note"
      ? { ...current, notes: addLine(current.notes, text, piece.opens, place) }
      : {
          ...current,
          paragraphs: addLine(current.paragraphs, text, piece.opens, place),
        };
  return { ...state, sections: [...rest, section], titled: true };
}

/**
 * A long chapter's text in parts of about this many bytes, split at
 * paragraphs, leaving room for its notes within an entry's 8,000 bytes.
 */
const ENTRY_BYTES = 6000;

function bytes(text: string): number {
  return Buffer.byteLength(text, "utf8");
}

/** Paragraphs grouped into parts, each starting where its first paragraph does. */
function partsOf(paragraphs: Block[], entryBytes: number): Block[][] {
  return paragraphs.reduce<Block[][]>((parts, paragraph) => {
    const last = parts.at(-1);
    const size = (last ?? []).reduce(
      (sum, block) => sum + bytes(block.text),
      0,
    );
    return last && last.length > 0 && size + bytes(paragraph.text) <= entryBytes
      ? [...parts.slice(0, -1), [...last, paragraph]]
      : [...parts, [paragraph]];
  }, []);
}

export interface ArchiveOcrOptions {
  /** Bytes of text per part of a long chapter. */
  entryBytes?: number;
}

/**
 * Parse a work from a scanned volume's hOCR: its chapters by their centred
 * numerals, paragraphs by first-line indent across pages, the author's
 * footnotes kept as notes. A long chapter is split at paragraphs into parts,
 * each cited from the page it starts on and carrying the notes of its pages.
 * Running heads, printer's signatures, rules and pages outside the work are
 * left out.
 */
export function parseArchiveOcrWork(
  hocr: string,
  work: ArchiveOcrWork,
  options: ArchiveOcrOptions = {},
): BookUnit[] {
  const pages = readPages(hocr);
  const printed = printedPageNumbers(pages.map(readingOf));
  const fullLines = pages.flatMap((page) =>
    page.lines.filter((line) => line.width > page.width / 2),
  );
  const volume: Volume = {
    heads: pages.flatMap((page) => {
      const head = numberedHead(page);
      const line = head ? page.lines[head.index] : undefined;
      return line ? [new Set(headWords(line.text))] : [];
    }),
    column: median(fullLines.map((line) => line.width)),
    textSize: median(fullLines.map((line) => line.size)),
  };
  const cased = createCaser(
    pages.flatMap((page) => page.lines.map((line) => line.text)),
  );
  const { sections } = pages
    .flatMap((page) => {
      const number = printed.get(page.leaf) ?? null;
      return number !== null &&
        number >= work.firstPage &&
        number <= work.lastPage &&
        !(work.skipPages ?? []).includes(number)
        ? [{ page, number }]
        : [];
    })
    .reduce<WorkState>(
      (state, { page, number }) =>
        piecesOf(page, volume).reduce<WorkState>(
          (done, piece) =>
            piece.kind === "heading"
              ? addHeading(
                  done,
                  headingOf(piece.lines),
                  cased,
                  { page: number, leaf: page.leaf },
                  work.title,
                )
              : addPiece(done, piece, { page: number, leaf: page.leaf }),
          state,
        ),
      { sections: [], chapters: 0, titled: false },
    );

  const filled = sections.filter((section) => section.paragraphs.length > 0);
  return filled.flatMap((section) => {
    const titles = section.path.map((step) => step.title);
    // A chapter with subsections holds its opening text beside them.
    const hasSubsections = filled.some(
      (other) =>
        other.path.length > section.path.length &&
        section.path.every((step, index) => other.path[index] === step),
    );
    const parents = hasSubsections ? titles : titles.slice(0, -1);
    const parts = partsOf(
      section.paragraphs,
      options.entryBytes ?? ENTRY_BYTES,
    );
    // A note goes with the last part that starts on or before its page.
    const partOfNote = (note: Block): number =>
      parts.reduce(
        (found, part, partIndex) =>
          (part[0]?.page ?? Infinity) <= note.page ? partIndex : found,
        0,
      );
    return parts.map((part, partIndex) => {
      const start = part[0] ?? { page: 0, leaf: 0 };
      const citation = `GW ${work.volume}, ${start.page}`;
      const notes = section.notes.filter(
        (note) => partOfNote(note) === partIndex,
      );
      return {
        parents,
        title: titles.at(-1) ?? citation,
        section: citation,
        page: citation,
        source: `https://archive.org/details/${work.item}/page/n${start.leaf}`,
        paragraphs: [...part, ...notes].map((block) => block.text),
      };
    });
  });
}
