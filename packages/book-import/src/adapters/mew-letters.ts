import type { BookUnit } from "../render-book";
import { unitsOfSections, type TitledSection } from "../sections";
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

/** A run's words: markup's entities read, its italics as emphasis, other markup dropped. */
function runText(inner: string): string {
  return inner
    .split(/(<i>[\s\S]*?<\/i>)/)
    .map((part) => {
      const plain = part
        .replace(/<[^>]+>/g, "")
        .replace(/&(?:#\d+|[a-z]+);/g, (entity) => ENTITIES[entity] ?? entity);
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
    const kept = runs.filter(
      (run) => run.size >= body * NOTE_SIZE || TRANSLATED.test(run.text),
    );
    const lines = kept.reduce<Array<Omit<Line, "margin">>>((done, run) => {
      if (TRANSLATED.test(run.text)) {
        return [...done, { ...run, text: "", pdfPage, body, translated: true }];
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
        },
      ];
    }, []);
    const full = lines.filter((line) => line.width > FULL_LINE);
    const margin = Math.min(...full.map((line) => line.left));
    return lines
      .map((line) => ({
        ...line,
        text: line.text.replace(/\s+/g, " ").trim(),
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
  [/^feb/i, 2],
  [/^m[äa]r/i, 3],
  [/^apr/i, 4],
  [/^ma[iy]/i, 5],
  [/^jun/i, 6],
  [/^jul/i, 7],
  [/^aug/i, 8],
  [/^sep/i, 9],
  [/^o[ck]t/i, 10],
  [/^nov/i, 11],
  [/^de[zc]/i, 12],
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
 * A dateline's misreadings set right: a 1 the OCR read as l or I beside a
 * digit, an 11 read as H before a month, a stray mark after the date.
 */
function cleanDate(text: string): string {
  return text
    .replace(/(?<=[\d.]\s?)[lI](?=[\d.])/g, "1")
    .replace(/(?<=\d)[lI](?![\p{L}])/gu, "1")
    .replace(/(?<![\p{L}])[lI](?=\d)/gu, "1")
    .replace(/(?<![\p{L}])H(?=\.\s?\p{L}{3,})/gu, "11")
    .replace(/(?<![\p{L}])[lI]O(?=ten\b|\.)/gu, "10")
    .replace(/(?<![\p{L}])[lI](?=\.\s?\p{L}{3,})/gu, "1")
    .replace(/(?<=\p{Ll})(?=1[78]\d\d\b)/u, " ")
    .replace(/(?<=\d{4})J$/u, "]")
    .replace(/(?<=\[[^\]]*\b1[78]\d\d)1(?=\s|$)/u, "]")
    .replace(/[\s'’‘`,-]+$/u, "");
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
const HEADING = /^(.+?)\s+an\s+(.+)$/;
/** The place a letter went to, opening the line under its heading. */
const RECIPIENT = /^(?:in|nach)\s/;
/** The editors' word on what a letter is, under its heading, its dateline perhaps run into it: (Entwurf). */
const EDITORIAL =
  /^[([]\s*(Entwurf|Abschrift|Fragment|Auszug|Konzept)\s*[)\]]\.?\s*(.*)$/i;
/** A letter's salutation, opening a line the OCR ran its dateline into. */
const SALUTATION =
  /^((?:Lieber|Liebe|Liebes|Liebster|Liebste|Teurer|Teure|Werter|Werte|Geehrter|Geehrte|Verehrter|Verehrte|Mein|Meine|Dear|My|Cher|Chère|Mon|Ma|Monsieur|Madame|Citoyen|Bürger)\b[^,!]{0,40}[,!])\s+(.+)$/u;

/**
 * A recipient's place and the dateline the text layer may have run into it,
 * parted at the first space, bracket or meeting of a small letter and a
 * capital after which a dateline opens, with a word, a bracket or a digit,
 * and dates the letter: in Brüssel[London], in ManchesterLondon, in
 * Frankfurt a. M. Paris.
 */
function recipientOf(text: string): [string, string | null] {
  const opening = /^(?:in|nach)\s+\S/u.exec(text)?.[0].length ?? text.length;
  const at = Array.from({ length: text.length }, (_, index) => index)
    .filter(
      (index) =>
        index >= opening &&
        (text[index - 1] === " " ||
          text[index] === "[" ||
          (/\p{Ll}/u.test(text[index - 1] ?? "") &&
            /\p{Lu}/u.test(text[index] ?? ""))),
    )
    .find((index) => {
      const rest = text.slice(index).trim();
      return /^(?:\p{L}{2}|\[|\d)/u.test(rest) && dateOf(rest) !== null;
    });
  return at === undefined
    ? [unmarked(text), null]
    : [unmarked(text.slice(0, at)), text.slice(at).trim()];
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
 * (erteiIt, PaImerston) and is read as one first.
 */
function parted(text: string): string {
  return text
    .replace(/(?<=\p{Ll})I(?=\p{Ll})/gu, "l")
    .replace(/(?<![\p{L}])(\p{Ll}{2,})(?=\p{Lu}\p{Ll})/gu, "$1 ");
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
  const lines = linesOf(xml);
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
      const heading =
        line.size >= line.body * HEADING_SIZE ? HEADING.exec(line.text) : null;
      if (heading) {
        const letter: Letter = {
          heading: unmarked(line.text),
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
      const next = lines[index + 1];
      if (
        /^\d{1,4}$/.test(line.text) &&
        next !== undefined &&
        next.size >= next.body * HEADING_SIZE
      ) {
        return done;
      }
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
      if (done.state === "recipient" && RECIPIENT.test(line.text)) {
        const [recipient, rest] = recipientOf(cleanDate(line.text));
        letter.heading = `${letter.heading} ${recipient}`;
        if (rest === null) return { ...done, state: "dateline" };
        dateline(rest);
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
        if (dateOf(text) !== null) {
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
        `${letter.heading.replace(/\.$/u, "")}. ${letter.dateline}`,
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
