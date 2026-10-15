import type { BookUnit } from "../render-book";
import { unitsOfSections, type TitledSection } from "../sections";
import type { OcrCorrection } from "./archive-ocr";
import { emphasised, escapeMarkdown, mergedEmphasis } from "./markup";
import { isWritersLetter, titleOf } from "./mega-letters";

/** A volume of the Marx-Engels-Werke's letters, as a PDF with its text layer. */
export interface MewLetters {
  /** The MEW volume: 30. */
  volume: number;
  /** The archive.org item holding the volumes. */
  item: string;
  /** The volume's file in the item, without its extension: mew_band30. */
  file: string;
  /** The writer whose letters are kept, as the headings name him: Marx. */
  writer: string;
  /** The first year whose letters are kept. */
  from?: number | undefined;
  /** The last year whose letters are kept. */
  to?: number | undefined;
  /** What the text layer misread, set right by MEW page. */
  corrections?: OcrCorrection[] | undefined;
}

/** A run of text in the PDF's text layer, its type size against the page's text. */
interface Run {
  left: number;
  width: number;
  size: number;
  /** Its words, emphasis marked. */
  text: string;
}

interface Line {
  left: number;
  width: number;
  size: number;
  text: string;
  /** The PDF page it stands on. */
  pdfPage: number;
  /** The page's type size and the left edge of its text. */
  body: number;
  margin: number;
  /** The editors' word that the letter before is their translation. */
  translated?: boolean;
  /** Its text as the runs set apart on it: a recipient's place and the dateline set beside it. */
  parts: string[];
}

/** A paragraph and the page it starts on. */
interface Block {
  text: string;
  page: number;
  pdfPage: number;
  label: string;
}

/** Superscript marks, the editors' note numbers among them, and the editors' notes at a page's foot are set this much smaller than the text at most. */
const NOTE_SIZE = 0.9;
/** A letter's heading, its writer and recipient, is set this much larger than the text at least. */
const HEADING_SIZE = 1.1;
/** A year or a part's title between the letters is set this much larger than the text at least. */
const TITLE_SIZE = 1.3;
/** A paragraph's first line is set in from the page's text by this much at least. */
const INDENT = 12;
/** Runs of one line stand this far apart at most, a superscript mark between them left out; a signature set right stands further. */
const RUN_GAP = 40;
/** The editors' word, after a letter, that its German is their translation: Aus dem Englischen. */
const TRANSLATED =
  /^\s*Aus dem (?:Englischen|Französischen|Italienischen|Spanischen|Russischen|Holländischen)\.?\s*$/;
/** Runs of one line are set in one type: a heading's and the text's differ by more than this share of the text's. */
const SIZE_STEP = 0.1;
/** A page's head counts where it agrees with the heads this many pages about it. */
const HEAD_REACH = 3;
/** Runs of one line this far apart at least are set apart: a place and the dateline beside it. */
const PART_GAP = 12;
/** Lines set at the margin start within this much of each other. */
const MARGIN_PLAY = 4;
/** A line of the text, not a heading or a signature, is at least this wide. */
const FULL_LINE = 250;

const ENTITIES: Record<string, string> = {
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&#34;": '"',
  "&quot;": '"',
  "&#39;": "'",
  "&apos;": "'",
};

/**
 * Words the text layer spaced out letter by letter, a space between their
 * letters and two between the words (W e n n  D u), a mark closing the
 * word set against its last letter (I I I.); a dash between them is no
 * letter of theirs (Stieber  - 3 Tage). It does so with
 * letterspaced and tightly set type alike, so the words are read without
 * emphasis.
 */
const SPACED =
  /(?<=^|\s\s|„)[\p{L}\d](?: (?:[\p{L}\d][.,;:!?)\]]?|[.,;:!?)\]])(?!\S))+(?:\s\s[\p{L}\d](?: (?:[\p{L}\d][.,;:!?)\]]?|[.,;:!?)\]])(?!\S))+)*/gu;

/** A run's words: markup's entities read, its spaced words closed up, its italics as emphasis, other markup dropped. */
function runText(inner: string): string {
  return inner
    .split(/(<i>[\s\S]*?<\/i>)/)
    .map((part) => {
      const plain = part
        .replace(/<[^>]+>/g, "")
        .replace(/&(?:#\d+|[a-z]+);/g, (entity) => ENTITIES[entity] ?? entity)
        // An opening quotation mark stands against its word: „ mightily.
        .replace(/„ (?=[\p{L}\d])/gu, "„")
        .replace(SPACED, (spaced) =>
          spaced
            .split(/\s\s+/)
            .map((word) => word.replace(/ /g, ""))
            .join(" "),
        );
      const escaped = escapeMarkdown(plain);
      return part.startsWith("<i>") ? emphasised(escaped) : escaped;
    })
    .join("");
}

/** Straight quotation marks as German ones: "so" is „so“. */
function germanQuotes(text: string): string {
  return text.replace(/(^|[\s([—–*])"|"/g, (_mark, before?: string) =>
    before === undefined ? "“" : `${before}„`,
  );
}

/** The type size most of the page's words are set in. */
function bodySize(runs: Run[]): number {
  const weights = runs.reduce(
    (tally, run) =>
      tally.set(run.size, (tally.get(run.size) ?? 0) + run.text.length),
    new Map<number, number>(),
  );
  return [...weights].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 0;
}

/** Below this share of the text's size a run is a mark, never the text. */
const MARK_SIZE = 0.7;
/** A note's mark: digits and brackets, as the text layer reads them. */
const MARK = /^[\s\d[\]()*|tlIi1.,'"’‘„“-]{1,8}$/;
/** The editors' source of a letter, or their word on it, set small after it. */
const APPARATUS = /^(?:Nach:|Aus dem|\[|\*)/;
/** A page's running head the text layer holds: 49 • Marx an Max Oppenheim • 30. August 1876. */
const RUNNING_HEAD = /\s[•·]\s/u;
/** The OCR's reading of a speck or a stamp, its signs no text sets. */
const SPECKS = /[$^~|{}<>]/;
/** A part's title between the letters: Briefe von Marx und Engels an dritte Personen. */
const PART_TITLE =
  /^\s*(?:Briefe von Marx und Engels|an dritte Personen|Briefwechsel zwischen Marx und Engels)\s*$/;
/** The printer's signature at a page's foot: 29*, 15 Marx/Engels, Werke, Bd. 27. */
const SIGNATURE = /^\s*\d{1,3}\s*\\?[*«»]?\s*$|Werke,?\s*Bd\.?\s*\d+\s*$/;
/** At most this many runs the text layer measured small stand between runs of the text. */
const EMBEDDED_RUNS = 3;

/**
 * A page's runs of the text: those set in its type, and those the text
 * layer measured as small as a note's between them, a word or a line; the
 * marks, the notes at the foot, the running head, the editors' sources and
 * the printer's signature left out.
 */
function textRuns(page: Run[], body: number): Run[] {
  // A part's title is set as large as a year's, though the text layer may
  // measure it as the text.
  const runs = (
    SIGNATURE.test(page.at(-1)?.text ?? "") ? page.slice(0, -1) : page
  ).map((run) =>
    PART_TITLE.test(run.text) ? { ...run, size: body * TITLE_SIZE } : run,
  );
  const text = (run: Run): boolean =>
    run.size >= body * NOTE_SIZE && run.size < body * TITLE_SIZE;
  const sized = (run: Run): boolean => run.size >= body * NOTE_SIZE;
  const mark = (run: Run): boolean =>
    !sized(run) &&
    (run.size < body * MARK_SIZE ||
      MARK.test(run.text) ||
      SPECKS.test(run.text));
  // Small runs read in a row, marks between them aside.
  const chains = runs.reduce<number[][]>((done, run, index) => {
    if (sized(run) || mark(run)) return done;
    const chain = done.at(-1);
    const previous = chain?.at(-1);
    return chain !== undefined &&
      previous !== undefined &&
      runs.slice(previous + 1, index).every(mark)
      ? [...done.slice(0, -1), [...chain, index]]
      : [...done, [index]];
  }, []);
  const resized = new Map(
    chains.flatMap((chain) => {
      const first = chain[0] ?? 0;
      const last = chain.at(-1) ?? 0;
      const before = runs
        .slice(0, first)
        .filter((run) => !mark(run))
        .at(-1);
      const after = runs.slice(last + 1).find((run) => !mark(run));
      const words = chain.map((index) => runs[index]?.text ?? "").join(" ");
      const embedded =
        before !== undefined &&
        text(before) &&
        after !== undefined &&
        text(after) &&
        chain.length <= EMBEDDED_RUNS &&
        !APPARATUS.test(runs[first]?.text.trim() ?? "") &&
        /\p{L}{3}/u.test(words) &&
        !RUNNING_HEAD.test(words) &&
        // The OCR's reading of a speck is signs and letters one by one.
        words.split(/\s+/u).filter((word) => /\p{L}{2}/u.test(word)).length *
          2 >
          words.split(/\s+/u).filter(Boolean).length;
      // Set in the text's type, they join its lines.
      return embedded
        ? chain.map((index): [number, number] => [index, after.size])
        : [];
    }),
  );
  return runs.flatMap((run, index) => {
    const size = resized.get(index);
    if (size !== undefined) return [{ ...run, size }];
    return sized(run) || TRANSLATED.test(run.text) ? [run] : [];
  });
}

/**
 * The PDF's pages as lines of text: the runs of each line in reading order,
 * superscript marks and the notes at the foot left out. A run that starts
 * left of where the last one ended opens a line, as does one set far right
 * of it, as a signature is.
 */
function linesOf(xml: string): Line[] {
  const sizes = new Map(
    [...xml.matchAll(/<fontspec id="(\d+)" size="(\d+)"/g)].map((match) => [
      match[1] ?? "",
      Number(match[2]),
    ]),
  );
  return [
    ...xml.matchAll(/<page number="(\d+)"[^>]*>([\s\S]*?)<\/page>/g),
  ].flatMap((page) => {
    const pdfPage = Number(page[1]);
    const runs: Run[] = [
      ...(page[2] ?? "").matchAll(
        /<text top="\d+" left="(\d+)" width="(\d+)" height="\d+" font="(\d+)"[^>]*>([\s\S]*?)<\/text>/g,
      ),
    ].map((match) => ({
      left: Number(match[1]),
      width: Number(match[2]),
      size: sizes.get(match[3] ?? "") ?? 0,
      text: runText(match[4] ?? ""),
    }));
    const body = bodySize(runs);
    const kept = textRuns(runs, body);
    const lines = kept.reduce<Array<Omit<Line, "margin">>>((done, run) => {
      if (TRANSLATED.test(run.text)) {
        return [
          ...done,
          { ...run, text: "", pdfPage, body, translated: true, parts: [] },
        ];
      }
      const last = done.at(-1);
      const end = last === undefined ? 0 : last.left + last.width;
      if (
        last &&
        last.translated !== true &&
        Math.abs(run.size - last.size) <= body * SIZE_STEP &&
        run.left >= end - 3 &&
        run.left <= end + RUN_GAP
      ) {
        return [
          ...done.slice(0, -1),
          {
            ...last,
            width: run.left + run.width - last.left,
            size: Math.max(last.size, run.size),
            text: `${last.text}${run.text}`,
            parts:
              run.left - end > PART_GAP
                ? [...last.parts, run.text]
                : [
                    ...last.parts.slice(0, -1),
                    `${last.parts.at(-1) ?? ""}${run.text}`,
                  ],
          },
        ];
      }
      return [
        ...done,
        {
          left: run.left,
          width: run.width,
          size: run.size,
          text: run.text,
          pdfPage,
          body,
          parts: [run.text],
        },
      ];
    }, []);
    const full = lines.filter((line) => line.width > FULL_LINE);
    // The margin is the edge the lines share: a speck the OCR read before
    // a line sets that line further left alone.
    const lefts = full.map((line) => line.left);
    const shared = lefts.filter(
      (left) =>
        lefts.filter((other) => Math.abs(other - left) <= MARGIN_PLAY).length >
        1,
    );
    const margin = Math.min(...(shared.length > 0 ? shared : lefts));
    return lines
      .map((line) => ({
        ...line,
        text: line.text.replace(/\s+/g, " ").trim(),
        parts: line.parts
          .map((part) => part.replace(/\s+/g, " ").trim())
          .filter((part) => part.length > 0),
        margin: Number.isFinite(margin) ? margin : line.left,
      }))
      .filter((line) => line.text.length > 0 || line.translated === true);
  });
}

/**
 * The MEW page each PDF page prints, by its running head as read: an even
 * page's number opens the head, an odd page's follows the date. A head read
 * against the heads about it is misread; a page whose head is unread or
 * misread takes its number from the nearest page read right.
 */
export function mewPageNumbers(
  heads: Map<number, string>,
): Map<number, number> {
  const read = [...heads].flatMap(
    ([pdfPage, head]): Array<[number, number]> => {
      const even = /^\s*(\d{1,3})\s+\d{1,3}\b/.exec(head)?.[1];
      const odd = /\b1[78]\d\d\s+(\d{1,3})\b/.exec(head)?.[1];
      const number = even ?? odd;
      return number === undefined ? [] : [[pdfPage, Number(number)]];
    },
  );
  const readOffsets = read.map(([pdfPage, number]) => [
    pdfPage,
    pdfPage - number,
  ]);
  // A head read right agrees with the heads about it: the PDF runs ahead of
  // the volume by as many pages as plates came before, which changes seldom.
  const offsets = readOffsets.filter(([, offset], index) => {
    const about = readOffsets
      .slice(Math.max(0, index - HEAD_REACH), index + HEAD_REACH + 1)
      .map(([, other = 0]) => other)
      .sort((a, b) => a - b);
    return offset === about[Math.floor(about.length / 2)];
  });
  return new Map(
    [...heads.keys()].map((pdfPage) => {
      const nearest = offsets.reduce<[number, number] | null>(
        (best, [at = 0, offset = 0]) =>
          best === null || Math.abs(at - pdfPage) < Math.abs(best[0] - pdfPage)
            ? [at, offset]
            : best,
        null,
      );
      return [pdfPage, pdfPage - (nearest?.[1] ?? 0)];
    }),
  );
}

const MONTHS: Array<[RegExp, number]> = [
  [/^jan/i, 1],
  [/^f[eé][bv]/i, 2],
  [/^m[äa]r/i, 3],
  [/^a[pv]r/i, 4],
  [/^ma[iy]/i, 5],
  [/^juil/i, 7],
  [/^jui?n/i, 6],
  [/^jul/i, 7],
  [/^aug/i, 8],
  [/^ao[uûü]t/i, 8],
  [/^sep/i, 9],
  [/^o[ck]t/i, 10],
  [/^nov/i, 11],
  [/^d[eé][zc]/i, 12],
];

/**
 * When a dateline dates its letter: year, month and day where it names them,
 * the year 0 where it names the day and month alone; none where it names
 * neither a year nor a day of a month.
 */
function dateOf(dateline: string): [number, number, number] | null {
  const year =
    /\b(1[78]\d\d)\b/.exec(dateline)?.[1] ??
    /\b(\d\d)\]?\.?\s*$/.exec(dateline)?.[1]?.replace(/^/, "18");
  const month =
    MONTHS.find(([name]) =>
      (dateline.match(/\p{L}{3,}/gu) ?? []).some((word) => name.test(word)),
    )?.[1] ?? 0;
  const day = Number(
    /(\d{1,2})\s*\.?\s*\]?\s*\p{L}{3,}/u.exec(dateline)?.[1] ?? 0,
  );
  if (year === undefined && (month === 0 || day === 0)) return null;
  return [Number(year ?? 0), month, day];
}

/**
 * Numbers as the OCR misread them: the I, l and O it took in a number read
 * as 1 and 0 (3I.Mai, I815, lOten), and a month's O it took for a 0 read as
 * O again (13.0ktober), an O opening a month never read into a number.
 */
function figures(text: string): string {
  return text
    .replace(
      /(?<![\p{L}\d])(?:(?:[\dlI]|O(?![kc]))*\d(?:[\dlI]|O(?![kc]))*|[lI][O0]+)/gu,
      (number) => number.replace(/[lI]/g, "1").replace(/O/g, "0"),
    )
    .replace(/(?<=\d\.?\s?)0(?=[kc]t)/g, "O");
}

/**
 * A dateline's misreadings set right: its numbers, a 1 the OCR read as l or
 * I beside a dot, an 11 read as H before a month, a bracket read as a
 * brace, the stray marks before and after it.
 */
function cleanDate(text: string): string {
  return figures(text)
    .replace(/^[^\p{L}\d[({]+/u, "")
    .replace(/\{(?=\p{L}[^{}[\]]*\])/gu, "[")
    .replace(/(\[[^\]{}]*)\}/u, "$1]")
    .replace(/(?<=[\d.]\s?)[lI](?=[\d.])/g, "1")
    .replace(/(?<![\p{L}])H(?=\.\s?\p{L}{3,})/gu, "11")
    .replace(/(?<![\p{L}])[lI](?=\.\s?\p{L}{3,})/gu, "1")
    .replace(/(?<=\p{Ll})(?=1[78]\d\d\b)/u, " ")
    .replace(/(?<=\d{4})J$/u, "]")
    .replace(/(?<=\[[^\]]*\b1[78]\d\d)1(?=\s|$)/u, "]")
    .replace(/[\s'’‘`,-]+$/u, "")
    .replace(/(?<=\p{L})(?=\d\d$)/u, " ");
}

/** A heading or a place without the OCR's stray marks: Engels •, Bern;. */
function unmarked(text: string): string {
  return text
    .replace(/\s*[•·;]+\s*/gu, " ")
    .replace(/\s+([.,])/gu, "$1")
    .replace(/[\s'’‘`,]+$/u, "")
    .trim();
}

/** A letter's heading: its writer and recipient, the place it went to. */
const HEADING = /^(.+?)\s+[aä]n\s+(.+)$/;
/** A heading in full, its writer and recipient named, no sentence: Marx an Justizrat Weber. */
const NAMED_HEADING =
  /^\p{Lu}[\p{L}.\- ]{1,40}\s[aä]n\s\p{Lu}[^.,;:!?]{1,60}$/u;
/** The place a letter went to, opening the line under its heading. */
const RECIPIENT = /^\[?(?:in|nach)\s/;
/** The OCR's misreadings of the in opening a recipient's place: m, in. */
const MISREAD_IN = /^(?:m|in\.)\s/;
/** The editors' word on what a letter is, under its heading, its dateline perhaps run into it: (Entwurf). */
const EDITORIAL =
  /^[([]\s*(Entwurf|Abschrift|Fragment|Auszug|Konzept)\s*[)\]]\.?\s*(.*)$/i;
/** A letter's salutation, opening a line the OCR ran its dateline into. */
const SALUTATION =
  /^((?:Lieber|Liebe|Liebes|Liebster|Liebste|Teurer|Teure|Werter|Werte|Geehrter|Geehrte|Verehrter|Verehrte|Mein|Meine|Dear|My|Cher|Chère|Mon|Ma|Monsieur|Madame|Citoyen|Bürger)\b[^,!]{0,40}[,!])(?:\s+(.+))?$/u;

/**
 * A recipient's place and the dateline the text layer may have run into it,
 * parted at the first space, bracket or meeting of a small letter and a
 * capital after which a dateline opens, with a word, a bracket or a digit,
 * and dates the letter: in Brüssel[London], in ManchesterLondon, in
 * Frankfurt a. M. Paris. A place in brackets opens the dateline before
 * any word does: in New York [London].
 */
function recipientOf(text: string): [string, string | null] {
  const opening = /^\[?(?:in|nach)\s+\S/u.exec(text)?.[0].length ?? text.length;
  const dates = (index: number): boolean => {
    const rest = text.slice(index).trim();
    // A place opening the dateline stands apart from its date: London, 5. Mai.
    const word = /^(\p{L}+)\.?\s+\d/u.exec(rest)?.[1];
    return (
      /^(?:\p{L}{2}|\[|\d)/u.test(rest) &&
      (word === undefined || MONTHS.some(([name]) => name.test(word))) &&
      dateOf(rest) !== null
    );
  };
  const indices = Array.from({ length: text.length }, (_, index) => index);
  const bracketed = indices.find(
    (index) =>
      index >= opening &&
      text[index] === "[" &&
      /\p{Lu}/u.test(text[index + 1] ?? "") &&
      dates(index),
  );
  const at =
    bracketed ??
    indices
      .filter(
        (index) =>
          index >= opening &&
          (text[index - 1] === " " ||
            text[index] === "[" ||
            (/\p{Ll}/u.test(text[index - 1] ?? "") &&
              /\p{Lu}/u.test(text[index] ?? ""))),
      )
      .find(dates);
  return at === undefined
    ? [unmarked(text), null]
    : [unmarked(text.slice(0, at)), text.slice(at).trim()];
}

/** A dateline closing a line, its place opening it: … London, 16. Jan. 1865. */
const DATED_TAIL =
  /^(.*?)\s+(\p{Lu}[\p{L}.\- ]*,\s*(?:den\s+|d\.\s*)?\d{1,2}[.\s]*\p{L}+\.?\s*(?:1[78])?\d\d)$/u;
/** A dateline names its date within this many characters, unless the editors' bracket opens it. */
const DATE_REACH = 40;

/**
 * Whether a line may be a dateline: one names its date early, or opens with
 * the editors' bracket; a line of the text may name a date late, or open in
 * small letters, where a dateline opens so only with den, am and the like.
 */
function datelike(text: string): boolean {
  if (text.startsWith("[")) return true;
  const digit = text.search(/\d/u);
  return (
    digit >= 0 &&
    digit <= DATE_REACH &&
    !/^(?!(?:den|d\.|am|im|um)\s)\p{Ll}/u.test(text)
  );
}

interface Letter {
  heading: string;
  dateline: string;
  date: [number, number, number] | null;
  blocks: Block[];
  /** The PDF page its heading stands on. */
  pdfPage: number;
  /** The editors' translation, not the writer's German. */
  translated: boolean;
}

/**
 * Words the text layer ran together, parted: a word in small letters holds no
 * capital, so one there opens the next word (dreiMonate, denTag). Two
 * capitalised words stay as they are: Marx capitalises within compounds.
 * A capital I between small letters is the l the OCR took it for
 * (erteiIt, PaImerston) and is read as one first, and so are numbers.
 */
function parted(text: string): string {
  return figures(text)
    .replace(/(?<=\p{Ll})I(?=\p{Ll})/gu, "l")
    .replace(/(?<![\p{L}])(\p{Ll}{2,})(?=\p{Lu}\p{Ll})/gu, "$1 ");
}

/**
 * Lines with the text layer's misreadings set right, each correction on the
 * first line of its page that holds it; a line break in the correction sets
 * apart what the layer ran on. A correction that finds nothing to set right
 * is stale, and the import stops rather than keep the misreading.
 */
function corrected(
  lines: Line[],
  corrections: OcrCorrection[],
  labelOf: (pdfPage: number) => string,
): Line[] {
  return corrections.reduce((done, correction) => {
    const page = String(correction.page);
    const at = done.findIndex(
      (line) =>
        labelOf(line.pdfPage) === page &&
        line.parts.join("\n").includes(correction.from),
    );
    if (at < 0) {
      throw new Error(`No "${correction.from}" on page ${page} to correct`);
    }
    return done.map((line, index) => {
      if (index !== at) return line;
      const parts = line.parts
        .join("\n")
        .replace(correction.from, correction.to)
        .split("\n")
        .map((part) => part.trim())
        .filter((part) => part.length > 0);
      return { ...line, parts, text: parts.join(" ") };
    });
  }, lines);
}

/** A line run on the paragraph before: a word broken at its end joined, a hyphen kept before a capital. */
function joined(text: string, line: string): string {
  if (/[\p{L}]-$/u.test(text)) {
    return /^\p{Ll}/u.test(line)
      ? `${text.slice(0, -1)}${line}`
      : `${text}${line}`;
  }
  return `${text} ${line}`;
}

/**
 * Read a writer's letters from a volume of the Marx-Engels-Werke: each
 * letter opens at its heading, the writer and recipient set large, and
 * holds its dateline and text; the editors' notes and note marks are left
 * out. Kept are the writer's own letters and those he wrote with another,
 * in the German he wrote them in, not those the editors translated,
 * of the years asked, in the order they were written: each under its year,
 * titled by its heading and dateline, cited by MEW page.
 */
export function parseMewLetters(
  xml: string,
  heads: Map<number, string>,
  volume: MewLetters,
): BookUnit[] {
  const labels = mewPageNumbers(heads);
  const labelOf = (pdfPage: number): string =>
    String(labels.get(pdfPage) ?? pdfPage);
  const lines = corrected(linesOf(xml), volume.corrections ?? [], labelOf);
  const reading = lines.reduce<{
    letters: Letter[];
    open: Letter | null;
    state: "recipient" | "dateline" | "text";
  }>(
    (done, line, index) => {
      // A year or a part's title between the letters closes the one before.
      if (line.size >= line.body * TITLE_SIZE) {
        return { ...done, open: null };
      }
      // A heading is set larger than the text; under its letter's number
      // the text layer may measure it hardly larger.
      const headed = (at: number): boolean => {
        const candidate = lines[at];
        if (candidate === undefined) return false;
        if (candidate.size >= candidate.body * HEADING_SIZE) {
          return HEADING.test(candidate.text);
        }
        return (
          candidate.size >= candidate.body &&
          /^\d{1,4}$/.test(lines[at - 1]?.text ?? "") &&
          NAMED_HEADING.test(candidate.text)
        );
      };
      if (headed(index)) {
        const letter: Letter = {
          heading: germanQuotes(unmarked(line.text)).replace(
            /\s[aä]n\s/u,
            " an ",
          ),
          dateline: "",
          date: null,
          blocks: [],
          pdfPage: line.pdfPage,
          translated: false,
        };
        return {
          letters: [...done.letters, letter],
          open: letter,
          state: "recipient",
        };
      }
      // The letter's number stands above its heading.
      if (/^\d{1,4}$/.test(line.text) && headed(index + 1)) return done;
      const letter = done.open;
      if (letter === null) return done;
      if (line.translated === true) {
        letter.translated = true;
        return done;
      }
      const place = (text: string): Block => ({
        text,
        page: line.pdfPage,
        pdfPage: line.pdfPage,
        label: labelOf(line.pdfPage),
      });
      // A dateline's type is the edition's, not the writer's emphasis.
      const dateline = (set: string): void => {
        const text = set.replace(/(?<!\\)\*/g, "");
        letter.dateline = text;
        letter.date = dateOf(text);
        letter.blocks.push(place(text));
      };
      const addressed = cleanDate(line.text).replace(MISREAD_IN, "in ");
      if (done.state === "recipient" && RECIPIENT.test(addressed)) {
        // What the runs set beside the place is a line of its own: the
        // dateline, or an address above it.
        const [named = "", ...beside] = line.parts;
        const [recipient, ran] = recipientOf(
          cleanDate(named).replace(MISREAD_IN, "in "),
        );
        letter.heading = `${letter.heading} ${recipient}`;
        const rest = [ran ?? "", ...beside].join(" ").trim();
        if (rest.length === 0) return { ...done, state: "dateline" };
        const set = cleanDate(rest);
        if (dateOf(set) === null) {
          letter.blocks.push(place(set));
          return { ...done, state: "dateline" };
        }
        dateline(set);
        return { ...done, state: "text" };
      }
      if (done.state !== "text") {
        const editorial = EDITORIAL.exec(line.text);
        if (editorial?.[1] !== undefined) {
          letter.heading = `${letter.heading} (${editorial[1]})`;
          const rest = cleanDate(editorial[2] ?? "");
          if (dateOf(rest) === null) return { ...done, state: "dateline" };
          dateline(rest);
          return { ...done, state: "text" };
        }
        const text = cleanDate(line.text);
        const saluted = SALUTATION.exec(text);
        if (saluted?.[1] && saluted[2] && dateOf(saluted[2]) !== null) {
          dateline(saluted[2]);
          letter.blocks.push(place(saluted[1]));
          return { ...done, state: "text" };
        }
        // The dateline stands above the salutation: none is looked for after it.
        const greeting = SALUTATION.exec(line.text);
        if (greeting && greeting[2] === undefined) {
          letter.blocks.push(place(line.text));
          return { ...done, state: "text" };
        }
        // A line naming its date late may end with the dateline itself.
        const tail = DATED_TAIL.exec(text.replace(/(?<!\\)\*/gu, ""));
        if (!datelike(text) && tail?.[1] && tail[2]) {
          letter.blocks.push(place(tail[1]));
          dateline(tail[2]);
          return { ...done, state: "text" };
        }
        if (datelike(text) && dateOf(text) !== null) {
          // A dateline the OCR ran on into the salutation ends at its year.
          const ran = /^(.*?\b1[78]\d\d\]?\.?)\s+(\p{Lu}.*)$/u.exec(text);
          dateline(ran?.[1] ?? text);
          if (ran?.[2] !== undefined) letter.blocks.push(place(ran[2]));
          return { ...done, state: "text" };
        }
      }
      const last = letter.blocks.at(-1);
      if (
        last === undefined ||
        last.text === letter.dateline ||
        line.left > line.margin + INDENT
      ) {
        letter.blocks.push(place(line.text));
      } else {
        last.text = joined(last.text, line.text);
      }
      return done;
    },
    { letters: [], open: null, state: "text" },
  );
  // A dateline without its year takes it from the head of its page, else
  // from the letter before.
  const yearOf = (letter: Letter, before: number): number => {
    const named = letter.date?.[0] ?? 0;
    if (named > 0) return named;
    const headed = /\b(1[78]\d\d)\b/.exec(heads.get(letter.pdfPage) ?? "")?.[1];
    return headed === undefined ? before : Number(headed);
  };
  const dated = reading.letters.reduce<Array<Letter & { year: number }>>(
    (done, letter) => [
      ...done,
      { ...letter, year: yearOf(letter, done.at(-1)?.year ?? 0) },
    ],
    [],
  );
  const kept = dated
    .filter((letter) => isWritersLetter(letter.heading, volume.writer))
    .filter((letter) => !letter.translated)
    .filter(
      (letter) =>
        (volume.from === undefined || letter.year >= volume.from) &&
        (volume.to === undefined || letter.year <= volume.to),
    )
    .map((letter, order) => ({ letter, order }))
    .sort((a, b) => {
      const [, am, ad] = a.letter.date ?? [0, 0, 0];
      const [, bm, bd] = b.letter.date ?? [0, 0, 0];
      return (
        a.letter.year - b.letter.year || am - bm || ad - bd || a.order - b.order
      );
    })
    .map(({ letter }) => letter);
  const sections: Array<TitledSection<Block>> = kept.map((letter) => ({
    path: [{ year: letter.year }, {}],
    titles: [
      String(letter.year),
      titleOf(
        letter.dateline === ""
          ? letter.heading
          : `${letter.heading.replace(/\.$/u, "")}. ${letter.dateline}`,
        volume.writer,
      ),
    ],
    paragraphs: letter.blocks.map((block) => ({
      ...block,
      text: germanQuotes(mergedEmphasis(parted(block.text))),
    })),
    notes: [],
  }));
  return unitsOfSections(sections, (start) => ({
    citation: `MEW ${volume.volume}, ${start.label}`,
    source: `https://archive.org/details/${volume.item}/${volume.file}/page/n${start.pdfPage - 1}`,
  }));
}
