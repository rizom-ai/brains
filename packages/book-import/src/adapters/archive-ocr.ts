import { Window } from "happy-dom";
import type { BookUnit } from "../render-book";

/** A work inside a scanned volume, by its printed pages. */
export interface ArchiveOcrWork {
  /** The archive.org item, e.g. `freud-1940-gw-13`. */
  item: string;
  /** The volume's roman numeral, as citations name it. */
  volume: string;
  firstPage: number;
  lastPage: number;
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
/** Running heads sit in the top tenth of the page. */
const HEAD_ZONE = 0.1;
/** A first line indented by more than this share of the page opens a paragraph. */
const INDENT = 0.02;
/** A centred heading's middle sits this close to the page's middle. */
const CENTRE = 0.08;

const CHAPTER = /^[IVXL]+\.?$/;
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
              return {
                x: x0,
                y: y0,
                bottom: y1,
                width: x1 - x0,
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

function runningHeadNumber(page: Page): number | null {
  const first = page.lines[0];
  if (!first || first.y > page.height * HEAD_ZONE) return null;
  // The OCR reads a 1 in a page number as a dotless i.
  const match = RUNNING_HEAD.exec(first.text.replace(/(?<=\d)ı|ı(?=\d)/g, "1"));
  const number = match?.[1] ?? match?.[2];
  return number === undefined ? null : Number(number);
}

/**
 * Printed page numbers by scan leaf. Pages that open a chapter carry no
 * running head; the scan's leaves run on with the printed pages, so the most
 * common offset between the two numbers every page.
 */
function printedPages(pages: Page[]): (leaf: number) => number {
  const offsets = pages.flatMap((page) => {
    const number = runningHeadNumber(page);
    return number === null ? [] : [number - page.leaf];
  });
  const counts = offsets.reduce<Map<number, number>>(
    (tally, offset) => tally.set(offset, (tally.get(offset) ?? 0) + 1),
    new Map(),
  );
  const [offset] = [...counts.entries()].sort((a, b) => b[1] - a[1])[0] ?? [0];
  return (leaf) => leaf + offset;
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)] ?? 0;
}

type Piece =
  | { kind: "chapter"; title: string }
  | { kind: "text"; text: string; opens: boolean }
  | { kind: "note"; text: string; opens: boolean };

/** One page read as chapter headings, text lines and note lines, in order. */
function piecesOf(page: Page): Piece[] {
  const headless =
    runningHeadNumber(page) === null ? page.lines : page.lines.slice(1);
  const bodySize = median(headless.map((line) => line.size));
  // The footnotes open the page's foot: at the rule above them, or at a small
  // line that starts with a note marker. Everything below is notes; measured
  // sizes alone mistake a body line low on a curved page for one.
  const footAt = headless.findIndex(
    (line) =>
      line.y > page.height / 2 &&
      (!/\p{L}/u.test(line.text) ||
        (line.size < bodySize * NOTE_SIZE && NOTE_START.test(line.text))),
  );
  const noteFrom = footAt < 0 ? headless.length : footAt;
  const isNote = (line: Line): boolean => headless.indexOf(line) >= noteFrom;
  const textLines = headless.slice(0, noteFrom);
  // Most lines start at the margin; the lowest quarter of starts finds it.
  const margin =
    [...textLines.map((line) => line.x)].sort((a, b) => a - b)[
      Math.floor(textLines.length / 4)
    ] ?? 0;
  return headless.flatMap((line): Piece[] => {
    const centre = line.x + line.width / 2;
    const centred = Math.abs(centre - page.width / 2) < page.width * CENTRE;
    if (centred && CHAPTER.test(line.text)) {
      return [{ kind: "chapter", title: line.text.replace(/\.$/, "") }];
    }
    // A centred line set in capitals is the work's own title.
    if (
      centred &&
      line.text === line.text.toUpperCase() &&
      /\p{Lu}{3}/u.test(line.text)
    ) {
      return [];
    }
    if (isNote(line)) {
      if (
        !/\p{L}/u.test(line.text) ||
        SIGNATURE.test(line.text) ||
        isEdgeNoise(line.text)
      ) {
        return [];
      }
      return [
        { kind: "note", text: line.text, opens: NOTE_START.test(line.text) },
      ];
    }
    if (SIGNATURE.test(line.text) || isEdgeNoise(line.text)) return [];
    return [
      {
        kind: "text",
        text: line.text,
        opens: line.x - margin > page.width * INDENT,
      },
    ];
  });
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

interface Chapter {
  title: string;
  paragraphs: Block[];
  notes: Block[];
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
  const printed = printedPages(pages);
  const chapters = pages
    .filter((page) => {
      const number = printed(page.leaf);
      return number >= work.firstPage && number <= work.lastPage;
    })
    .reduce<Chapter[]>((chapters, page) => {
      const place = { page: printed(page.leaf), leaf: page.leaf };
      return piecesOf(page).reduce<Chapter[]>((done, piece) => {
        if (piece.kind === "chapter") {
          return [...done, { title: piece.title, paragraphs: [], notes: [] }];
        }
        // Text before the first numeral belongs to the work's opening.
        const current = done.at(-1) ?? { title: "", paragraphs: [], notes: [] };
        const rest = done.length > 0 ? done.slice(0, -1) : [];
        const text = piece.text.replace(OCR_NOTE_MARKER, "¹)");
        return [
          ...rest,
          piece.kind === "note"
            ? {
                ...current,
                notes: addLine(current.notes, text, piece.opens, place),
              }
            : {
                ...current,
                paragraphs: addLine(
                  current.paragraphs,
                  text,
                  piece.opens,
                  place,
                ),
              },
        ];
      }, chapters);
    }, []);

  // Chapters within a work run in order; the OCR misreads numerals, so a
  // chapter takes its place among them. Text before the first numeral, or a
  // work without numerals, is named by where it stands.
  return chapters
    .filter((chapter) => chapter.paragraphs.length > 0)
    .flatMap((chapter, index, all) => {
      const place = all
        .slice(0, index + 1)
        .filter((other) => other.title !== "").length;
      const parts = partsOf(
        chapter.paragraphs,
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
        const notes = chapter.notes.filter(
          (note) => partOfNote(note) === partIndex,
        );
        return {
          parents: [],
          title: chapter.title === "" ? citation : roman(place),
          section: citation,
          page: citation,
          source: `https://archive.org/details/${work.item}/page/n${start.leaf}`,
          paragraphs: [...part, ...notes].map((block) => block.text),
        };
      });
    });
}
