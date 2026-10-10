import { readFile } from "node:fs/promises";
import { Window } from "happy-dom";
import { pageText } from "./adapters/archive-ocr";
import {
  readCorrectionsBeside,
  writeCorrectionsBeside,
} from "./corrections-file";
import {
  firstOfEachVolume,
  volumeHocr,
  parseManifest,
  scannedBooks,
  type Corrections,
} from "./import-books";
import { importerPageOcr } from "./page-ocr";
import { createImporterFetch } from "./polite-fetch";
/** A printed page's text as the importer reads it. */
export interface PageOfText {
  page: number | string;
  text: string;
}

/** What a transcription says about one page of the OCR. */
export interface PageCheck {
  page: number | string;
  words: number;
  /** Words no run of three in the transcription confirms: the OCR's errors. */
  wrong: string[];
  /** Whether the transcription has this page's text at all. */
  covered: boolean;
}

/** A page with more unconfirmed words than this is not in the transcription. */
const UNCOVERED = 0.3;

/** The page's words, a word broken at a line's end joined again. */
function wordsOf(text: string): string[] {
  return text
    .replace(/(\p{L})-\n(\p{Ll})/gu, "$1$2")
    .split(/[^\p{L}]+/u)
    .filter((word) => word.length > 0);
}

/**
 * A word as editions and spellings agree on it: in small letters, ß as ss,
 * a dotless i as i, and the spelling before 1901 as today's: th as t (Theil),
 * ie as i (giebt, marschirte), c as z or k (Civilisation, Kompagnie), a first
 * Ue, Ae or Oe as Ü, Ä or Ö, dt as t (getödtet), doubled letters as one
 * (baar, sämmtlich, Gefängniß).
 */
function keyOf(word: string): string {
  return word
    .toLowerCase()
    .replace(/ı/gu, "i")
    .replace(/ß/gu, "ss")
    .replace(/th/gu, "t")
    .replace(/^ue/u, "ü")
    .replace(/^ae/u, "ä")
    .replace(/^oe/u, "ö")
    .replace(/dt/gu, "t")
    .replace(/ie/gu, "i")
    .replace(/c(?=[eiy])/gu, "z")
    .replace(/c(?!h)/gu, "k")
    .replace(/(\p{L})\1/gu, "$1");
}

function runs(keys: string[]): string[] {
  return keys
    .slice(2)
    .map((key, index) => `${keys[index]} ${keys[index + 1]} ${key}`);
}

/** The stretches of consecutive marked positions, first and last of each. */
function stretchesOf(marked: boolean[]): Array<[number, number]> {
  return marked.reduce<Array<[number, number]>>((found, mark, index) => {
    if (!mark) return found;
    const last = found.at(-1);
    return last?.[1] === index - 1
      ? [...found.slice(0, -1), [last[0], index]]
      : [...found, [index, index]];
  }, []);
}

/** A word of the OCR, and the page it stands on. */
interface PlacedWord {
  word: string;
  page: number;
}

/**
 * The book's words in reading order, each on its page; a word broken at the
 * foot of a page joins its end on the next and stands on the first.
 */
function placedWords(
  pages: PageOfText[],
  vocabulary: Set<string>,
): PlacedWord[] {
  const lines = pages.map(({ text }) => text.split("\n"));
  const HYPHENATED = /\p{L}-\s*$/u;
  // The line a word breaks off at the foot of the page, when the next page
  // goes on in small letters: the last line ending in a hyphen, above any
  // notes, whose word the next page completes into one the text knows.
  const brokenLine = (index: number): number => {
    const next = /^\s*\p{Ll}/u.test(pages[index + 1]?.text ?? "")
      ? wordsOf(pages[index + 1]?.text ?? "")[0]
      : undefined;
    if (next === undefined) return -1;
    const own = lines[index] ?? [];
    const completes = own
      .map((line, at) => {
        const head = wordsOf(line).at(-1);
        return HYPHENATED.test(line) &&
          head !== undefined &&
          vocabulary.has(keyOf(`${head}${next}`))
          ? at
          : -1;
      })
      .filter((at) => at >= 0);
    return completes.at(-1) ?? -1;
  };
  return pages.flatMap(({ text }, index) => {
    const at = brokenLine(index);
    const next = at < 0 ? "" : (wordsOf(pages[index + 1]?.text ?? "")[0] ?? "");
    const joined =
      at < 0
        ? text
        : (lines[index] ?? [])
            .map((line, lineIndex) =>
              lineIndex === at ? line.replace(/-\s*$/u, next) : line,
            )
            .join("\n");
    const words = wordsOf(joined);
    const own =
      index > 0 && brokenLine(index - 1) >= 0 ? words.slice(1) : words;
    return own.map((word) => ({ word, page: index }));
  });
}

/**
 * Check pages of OCR against a transcription of the same text. A word is
 * wrong where the transcription never uses it, nor writes it as two words
 * (zu Grunde); an OCR error makes a word no edition has. Runs of three words
 * tell whether a page's text is in the transcription at all: a page whose
 * runs it mostly lacks holds text its edition does not have, and is left out.
 */
export function checkPages(
  pages: PageOfText[],
  reference: string,
  isWord: (word: string) => boolean = () => false,
): PageCheck[] {
  const referenceKeys = wordsOf(reference).map(keyOf);
  const vocabulary = new Set([
    ...referenceKeys,
    ...referenceKeys
      .slice(1)
      .map((key, index) => `${referenceKeys[index]}${key}`),
  ]);
  const known = new Set(runs(referenceKeys));
  const placed = placedWords(pages, vocabulary);
  const keys = placed.map(({ word }) => keyOf(word));
  const inRun = (index: number): boolean =>
    [index - 2, index - 1, index].some(
      (start) =>
        start >= 0 &&
        start + 2 < keys.length &&
        known.has(keys.slice(start, start + 3).join(" ")),
    );
  // A misread leaves itself, and only itself, outside every confirmed run;
  // a short stretch of such words with confirmed words on both sides is a
  // misread. A longer stretch is a passage the edition lacks.
  const stretches = stretchesOf(keys.map((_, index) => !inRun(index)));
  const misread = new Set(
    stretches
      .filter(
        ([first, last]) =>
          last - first + 1 <= MAX_RUN && inRun(first - 1) && inRun(last + 1),
      )
      .flatMap(([first, last]) =>
        Array.from({ length: last - first + 1 }, (_, at) => first + at),
      ),
  );
  return pages.map(({ page }, pageIndex) => {
    const onPage = placed
      .map((entry, index) => ({ ...entry, index }))
      .filter((entry) => entry.page === pageIndex);
    const unconfirmed = onPage.filter(({ index }) => !inRun(index)).length;
    const covered =
      onPage.length > 0 && unconfirmed / onPage.length < UNCOVERED;
    return {
      page,
      words: onPage.length,
      wrong: covered
        ? onPage
            .filter(
              ({ index }) =>
                !vocabulary.has(keys[index] ?? "") &&
                misread.has(index) &&
                !isWord(placed[index]?.word ?? ""),
            )
            .map(({ word }) => word)
        : [],
      covered,
    };
  });
}

/** A Project Gutenberg text without its header and licence. */
/** A web page's text: its paragraphs, headings and list items, a line each. */
function pageTextOf(html: string): string {
  const window = new Window();
  try {
    const document = window.document;
    document.write(html);
    document.querySelectorAll("script, style").forEach((element) => {
      element.remove();
    });
    return Array.from(
      document.querySelectorAll("p, h1, h2, h3, h4, h5, h6, li"),
    )
      .map((element) => element.textContent.replace(/\s+/gu, " ").trim())
      .filter((text) => text.length > 0)
      .join("\n");
  } finally {
    // Closing only releases the window's timers; parsing is already done.
    void window.happyDOM.close();
  }
}

export function referenceText(raw: string): string {
  if (/<(html|body)[\s>]/iu.test(raw)) return pageTextOf(raw);
  const lines = raw.split(/\r?\n/u);
  const start = lines.findIndex((line) => /^\*\*\* ?START OF/u.test(line));
  const end = lines.findIndex((line) => /^\*\*\* ?END OF/u.test(line));
  return lines
    .slice(start < 0 ? 0 : start + 1, end < 0 ? undefined : end)
    .join("\n");
}

/** A word of a text, where it stands, and its key. */
interface Token {
  word: string;
  key: string;
  start: number;
  end: number;
}

function tokensOf(text: string): Token[] {
  return [...text.matchAll(/\p{L}+/gu)].map((match) => ({
    word: match[0],
    key: keyOf(match[0]),
    start: match.index,
    end: match.index + match[0].length,
  }));
}

/** A line's fix: the text from its first context word to its last, read and right. */
export interface ReferenceCorrection {
  page: number | string;
  from: string;
  to: string;
}

/**
 * A transcription's dashes and quotes as German editions print them: a
 * straight quote opens low after a space or a bracket, and closes high.
 */
function asPrinted(text: string): string {
  return text
    .replace(/(^|[\s(—–-])"/gu, "$1„")
    .replace(/"/gu, "“")
    .replace(/--/gu, "—")
    .replace(/»/gu, "„")
    .replace(/«/gu, "“")
    .replace(/›/gu, "‚")
    .replace(/‹/gu, "‘");
}

/** A misread run is at most this many tokens; longer damage is read from the scan. */
const MAX_RUN = 4;
/**
 * Lines whose last word the OCR read without its hyphen: the next line goes
 * on in small letters, and the transcription knows the two only as one word
 * (Amphi / tryon). Each fix gives the line's last word its hyphen back, so
 * the reader joins the word again.
 */
export function lostHyphens(
  pages: PageOfText[],
  reference: string,
): ReferenceCorrection[] {
  const known = new Set(wordsOf(reference).map(keyOf));
  return pages.flatMap(({ page, text }, pageIndex) => {
    const lines = text.split("\n");
    // The page's last line goes on in the next page's first.
    const next = (pages[pageIndex + 1]?.text ?? "").split("\n")[0] ?? "";
    return lines.flatMap((line, index) => {
      const head = /(\p{L}+)$/u.exec(line)?.[1];
      const tail = /^(\p{Ll}\p{L}*)/u.exec(lines[index + 1] ?? next)?.[1];
      if (head === undefined || tail === undefined) return [];
      const joined = keyOf(`${head}${tail}`);
      const apart = known.has(keyOf(head)) && known.has(keyOf(tail));
      // As much of the line's end as no line before it holds places the fix,
      // whatever else is fixed on the line: a correction fixes the first
      // line that holds its text.
      const words = line.split(/(?<=\s)(?=\S)/u);
      const end =
        Array.from({ length: words.length }, (_, from) =>
          words.slice(Math.max(0, words.length - 2 - from)).join(""),
        ).find(
          (ending) =>
            !lines.slice(0, index).some((before) => before.includes(ending)) &&
            line.indexOf(ending) === line.length - ending.length,
        ) ?? line;
      return known.has(joined) && !apart
        ? [{ page, from: end, to: `${end}-` }]
        : [];
    });
  });
}

/** A transcription writing more than this share of shared words otherwise spells otherwise. */
const SPELLED_OTHERWISE = 0.02;

/** Words this short are spelled alike before and after the spelling reform. */
const SPELLED_ALIKE = 5;

/** The transcription may have at most this many words where the run stands. */
const MAX_GAP = 4;

/**
 * Fixes for misread words from a transcription of the same work. A run of
 * words the transcription never uses is replaced where the two words on each
 * side of it, on the same line, occur in the transcription exactly once with
 * at most a few words between: those words, with their punctuation, are the
 * right reading. A run whose context the transcription does not share, or
 * shares more than once, is left for the scan to tell. A word the author's
 * text uses elsewhere is a reading of this edition, not a misread, and stays.
 * A fix is written in the edition's own spelling; where the transcription
 * spells otherwise, none is made with a word the edition never uses, so a
 * transcription in today's spelling cannot carry its spelling in.
 */
export function referenceCorrections(
  pages: PageOfText[],
  reference: string,
  isWord: (word: string) => boolean = () => false,
): ReferenceCorrection[] {
  const cleaned = reference.replace(/[_~]/gu, "");
  const known = tokensOf(cleaned);
  const keys = known.map((token) => token.key);
  const vocabulary = new Set([
    ...keys,
    ...keys.slice(1).map((key, index) => `${keys[index]}${key}`),
  ]);
  // The edition's own spelling of each word, by key: its commonest form.
  const counted = pages
    .flatMap(({ text }) => wordsOf(text))
    .reduce(
      (seen, word) => seen.set(word, (seen.get(word) ?? 0) + 1),
      new Map<string, number>(),
    );
  const spelling = [...counted]
    .sort((a, b) => b[1] - a[1])
    .reduce((forms, [word]) => {
      const key = keyOf(word);
      return forms.has(key) ? forms : forms.set(key, word);
    }, new Map<string, string>());
  // Whether the transcription spells otherwise than the edition: of the
  // words both use, it writes enough in another form (Teil for Theil).
  const shared = [...new Set(known.map((token) => token.word))].filter((word) =>
    spelling.has(keyOf(word)),
  );
  const otherwise =
    shared.filter(
      (word) => spelling.get(keyOf(word))?.toLowerCase() !== word.toLowerCase(),
    ).length >
    shared.length * SPELLED_OTHERWISE;
  // A word of the transcription as the edition spells it, keeping its
  // capital. Where the transcription spells otherwise, a word the edition
  // never uses is null, unless short enough to be spelled alike either way.
  const asEdition = (word: string): string | null => {
    const form = spelling.get(keyOf(word));
    if (form === undefined) {
      return otherwise && word.length > SPELLED_ALIKE ? null : word;
    }
    return /^\p{Lu}/u.test(word)
      ? `${form.charAt(0).toUpperCase()}${form.slice(1)}`
      : `${form.charAt(0).toLowerCase()}${form.slice(1)}`;
  };
  const pairs = keys.slice(1).reduce((index, key, at) => {
    const pair = `${keys[at]} ${key}`;
    return index.set(pair, [...(index.get(pair) ?? []), at]);
  }, new Map<string, number[]>());

  // A page's words in reading order, each with its line: the words around a
  // misread may stand on the line above or below it.
  const fix = (text: string, page: number | string): ReferenceCorrection[] => {
    const lines = text.split("\n");
    const tokens = lines.flatMap((line, at) =>
      tokensOf(line).map((token, index, all) => ({
        ...token,
        line: at,
        // A word broken at either end of the line is half a word.
        broken:
          (index === 0 && /^\p{Ll}/u.test(line.trimStart())) ||
          (index === all.length - 1 && /-\s*$/u.test(line)),
      })),
    );
    const flagged = tokens.map(
      (token) => !vocabulary.has(token.key) && !token.broken,
    );
    // A misread stretch stays on its line.
    const runs = stretchesOf(flagged).flatMap(([first, last]) =>
      tokens
        .slice(first, last + 1)
        .reduce<Array<[number, number]>>((found, token, offset) => {
          const index = first + offset;
          const open = found.at(-1);
          return open && tokens[open[1]]?.line === token.line
            ? [...found.slice(0, -1), [open[0], index]]
            : [...found, [index, index]];
        }, []),
    );
    return runs.flatMap(([first, last]) => {
      const [left2, left1] = [tokens[first - 2], tokens[first - 1]];
      const [right1, right2] = [tokens[last + 1], tokens[last + 2]];
      const run = tokens.slice(first, last + 1);
      const line = lines[run[0]?.line ?? 0] ?? "";
      const lineOf = run[0]?.line;
      if (
        run.every((token) => isWord(token.word)) ||
        last - first + 1 > MAX_RUN ||
        !left2 ||
        !left1 ||
        !right1 ||
        !right2 ||
        flagged[first - 2] ||
        flagged[first - 1] ||
        flagged[last + 1] ||
        flagged[last + 2]
      ) {
        return [];
      }
      const candidates = (pairs.get(`${left2.key} ${left1.key}`) ?? []).flatMap(
        (at) =>
          Array.from({ length: MAX_GAP + 1 }, (_, gap) => gap)
            .filter(
              (gap) =>
                keys[at + 2 + gap] === right1.key &&
                keys[at + 3 + gap] === right2.key,
            )
            .map((gap) => ({ at, gap })),
      );
      const only = candidates.length === 1 ? candidates[0] : undefined;
      const leftEnd = only ? known[only.at + 1] : undefined;
      const rightStart = only ? known[only.at + 2 + only.gap] : undefined;
      if (!leftEnd || !rightStart) return [];
      const transcribed = asPrinted(
        cleaned.slice(leftEnd.end, rightStart.start).replace(/\s+/gu, " "),
      );
      // The transcription's own note marks are not the author's text.
      if (/[([]\d+[)\]]/u.test(transcribed)) return [];
      // The transcription's words in the edition's spelling; a word the
      // edition never uses could carry the transcription's spelling in.
      const respelled = [...transcribed.matchAll(/\p{L}+/gu)].map((match) =>
        asEdition(match[0]),
      );
      if (respelled.some((word) => word === null)) return [];
      const between = [...transcribed.matchAll(/\p{L}+/gu)].reduceRight(
        (text, match, index) =>
          `${text.slice(0, match.index)}${respelled[index] ?? match[0]}${text.slice(match.index + match[0].length)}`,
        transcribed,
      );
      // The fix spans the misread's line from its first word around to its
      // last; words around it on another line bound it at the line's ends,
      // and what that line sets beside them is left to it, where the
      // transcription sets it so.
      const leftHere = left1.line === lineOf;
      const rightHere = right1.line === lineOf;
      const leftRest = leftHere
        ? ""
        : (lines[left1.line] ?? "").slice(left1.end).trim();
      const rightLead = rightHere
        ? ""
        : (lines[right1.line] ?? "").slice(0, right1.start).trim();
      const inner = between.trim();
      if (!inner.startsWith(leftRest) || !inner.endsWith(rightLead)) return [];
      const own = inner.slice(leftRest.length, inner.length - rightLead.length);
      const from = leftHere
        ? left2.line === lineOf
          ? left2.start
          : left1.start
        : 0;
      const to = rightHere
        ? right2.line === lineOf
          ? right2.end
          : right1.end
        : line.length;
      return [
        {
          page,
          from: line.slice(from, to),
          to: `${leftHere ? line.slice(from, left1.end) : ""}${
            leftHere
              ? rightHere
                ? between
                : between.slice(
                    0,
                    between.length - between.trimStart().length,
                  ) + own.trim()
              : rightHere
                ? own.trim() + between.slice(between.trimEnd().length)
                : own.trim()
          }${rightHere ? line.slice(right1.start, to) : ""}`,
        },
      ];
    });
  };

  return pages.flatMap(({ page, text }) => fix(text, page));
}

/** A word spelled as a word, used this often across the author's volumes, is real. */
const REAL_USES = 3;

/**
 * A word of the spelling before the reform of 1901, as it may be spelled
 * today: th as t (wüthete), -iren as -ieren (dupiren), a first C as K or Z
 * (Civilisation), a first Ae, Oe or Ue as Ä, Ö or Ü, -niß as -nis, and ß as
 * ss where today's spelling has it (muß).
 */
export function modernForms(word: string): string[] {
  const reformed = word
    .replace(/th/gu, "t")
    .replace(/Th(?=\p{Ll})/gu, "T")
    .replace(
      /(\p{L}{3,})ir(en|t|te|ten|ter|tes|tem|end|ung|ungen)$/u,
      "$1ier$2",
    )
    .replace(/^C(?=[aouAOU])/u, "K")
    .replace(/^C(?=[eiyEIY])/u, "Z")
    .replace(/^Ae/u, "Ä")
    .replace(/^Oe/u, "Ö")
    .replace(/^Ue/u, "Ü")
    .replace(/niß$/u, "nis");
  return [...new Set([word, reformed, reformed.replace(/ß/gu, "ss")])];
}
const SPELLED = /^\p{Lu}?\p{Ll}+$/u;
/** The plan's OCR gate: fewer than one wrong word in this many. */
const GATE = 200;

/** A scanned book's arabic pages, without those its manifest leaves out. */
function pagesOfBook(book: {
  firstPage: number | string;
  lastPage: number;
  skipPages: number[];
}): number[] {
  const first = typeof book.firstPage === "number" ? book.firstPage : 1;
  return Array.from(
    { length: Math.max(0, book.lastPage - first + 1) },
    (_, index) => first + index,
  ).filter((page) => !book.skipPages.includes(page));
}

const USAGE =
  "Usage: bun packages/book-import/src/check-ocr.ts <manifest.yaml> [--correct] [--show] [--dictionary=<hunspell dictionary>]";

/**
 * The words a spelling dictionary accepts: real words, so that where a
 * transcription reads otherwise, it is another edition's reading, not a
 * misread. Runs hunspell, given the path of a dictionary without its suffix.
 */
async function dictionaryWords(
  words: string[],
  dictionary: string,
): Promise<Set<string>> {
  const checker = Bun.spawn(
    ["hunspell", "-i", "utf-8", "-d", dictionary, "-l"],
    {
      stdin: new TextEncoder().encode(words.join("\n")),
      stdout: "pipe",
    },
  );
  const rejected = new Set(
    (await new Response(checker.stdout).text()).split("\n").filter(Boolean),
  );
  if ((await checker.exited) !== 0) throw new Error("hunspell failed");
  return new Set(words.filter((word) => !rejected.has(word)));
}

/**
 * Check every scanned book that names a transcription; with --correct, add
 * the fixes the transcriptions give to the corrections beside the manifest.
 */
async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const manifestPath = args.find((arg) => !arg.startsWith("--"));
  const correct = args.includes("--correct");
  const show = args.includes("--show");
  const dictionary = args
    .find((arg) => arg.startsWith("--dictionary="))
    ?.slice(13);
  if (!manifestPath) {
    console.error(USAGE);
    process.exit(1);
  }
  const manifest = parseManifest(await readFile(manifestPath, "utf8"));
  const books = scannedBooks(manifest);
  const fetchText = createImporterFetch();
  const corrections = await readCorrectionsBeside(manifestPath);
  const volumes = firstOfEachVolume(books);
  const hocrs = new Map(
    await volumes.reduce<Promise<Array<[string, string]>>>(
      async (done, book) => [
        ...(await done),
        [
          book.item,
          await volumeHocr(book, fetchText, importerPageOcr(fetchText)),
        ],
      ],
      Promise.resolve([]),
    ),
  );
  const textOf = (book: (typeof books)[number]): PageOfText[] =>
    pagesOfBook(book).flatMap((page) => {
      try {
        return [
          {
            page,
            text: pageText(
              hocrs.get(book.item) ?? "",
              page,
              corrections[book.item] ?? [],
            ),
          },
        ];
      } catch (error) {
        // A page the scan lacks has no text to check; a stale correction
        // must stop the run.
        if (String(error).includes("to correct")) throw error;
        return [];
      }
    });
  const texts = new Map(books.map((book) => [book.slug, textOf(book)]));
  const uses = [...texts.values()]
    .flat()
    .flatMap(({ text }) => wordsOf(text))
    .reduce(
      (tally, word) => tally.set(word, (tally.get(word) ?? 0) + 1),
      new Map<string, number>(),
    );
  const accepted = dictionary
    ? await dictionaryWords(
        [...new Set([...uses.keys()].flatMap(modernForms))],
        dictionary,
      )
    : new Set<string>();
  // A word the dictionary knows, also in today's spelling of an older one.
  const isWord = (word: string): boolean =>
    modernForms(word).some((form) => accepted.has(form)) ||
    (SPELLED.test(word) && (uses.get(word) ?? 0) >= REAL_USES);

  const added = await books
    .filter((book) => book.references !== undefined)
    .reduce<Promise<Corrections>>(async (done, book) => {
      const found = await done;
      const reference = await (book.references ?? []).reduce<Promise<string>>(
        async (text, url) =>
          `${await text}\n${referenceText(await fetchText(url))}`,
        Promise.resolve(""),
      );
      const pages = texts.get(book.slug) ?? [];
      const printed = new Set(book.printedWords);
      const checks = checkPages(
        pages,
        reference,
        (word) => isWord(word) || printed.has(word),
      ).filter((check) => check.covered);
      const words = checks.reduce((sum, check) => sum + check.words, 0);
      const wrong = checks.reduce((sum, check) => sum + check.wrong.length, 0);
      const passes = wrong * GATE < words;
      console.log(
        `${passes ? "pass" : "FAIL"} ${book.slug}: ${wrong} wrong in ${words} words${wrong ? ` (1 in ${Math.round(words / wrong)})` : ""}`,
      );
      if (show) {
        // The words read wrong most often, to tell a misread from a spelling
        // the transcription modernised.
        const counts = checks
          .flatMap((check) => check.wrong)
          .reduce(
            (seen, word) => seen.set(word, (seen.get(word) ?? 0) + 1),
            new Map<string, number>(),
          );
        console.log(
          [...counts]
            .sort((a, b) => b[1] - a[1])
            .slice(0, 80)
            .map(([word, count]) => `${word} ${count}`)
            .join(", "),
        );
        // The pages with most of them, to read against their scans.
        checks
          .filter((check) => check.wrong.length >= 3)
          .sort((a, b) => b.wrong.length - a.wrong.length)
          .slice(0, 20)
          .forEach((check) => {
            console.log(`  p. ${check.page}: ${check.wrong.join(", ")}`);
          });
      }
      if (!correct) return found;
      const existing = corrections[book.item] ?? [];
      const fixes = [
        ...lostHyphens(pages, reference),
        ...referenceCorrections(pages, reference, isWord),
      ].filter(
        (fix) =>
          !existing.some(
            (known) =>
              String(known.page) === String(fix.page) &&
              known.from === fix.from,
          ),
      );
      return {
        ...found,
        [book.item]: [
          ...(found[book.item] ?? []),
          ...fixes.map((fix) => ({ ...fix, by: "reference" as const })),
        ],
      };
    }, Promise.resolve({}));
  if (correct) {
    const merged = Object.fromEntries(
      [...new Set([...Object.keys(corrections), ...Object.keys(added)])].map(
        (item) => [
          item,
          [...(corrections[item] ?? []), ...(added[item] ?? [])],
        ],
      ),
    );
    await writeCorrectionsBeside(manifestPath, merged);
    const count = Object.values(added).reduce(
      (sum, list) => sum + list.length,
      0,
    );
    console.log(`${count} corrections from transcriptions added`);
  }
}

if (import.meta.main) await main();
