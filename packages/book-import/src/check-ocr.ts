import { readFile } from "node:fs/promises";
import { pageText } from "./adapters/archive-ocr";
import {
  readCorrectionsBeside,
  writeCorrectionsBeside,
} from "./corrections-file";
import {
  fetchVolumeHocr,
  parseManifest,
  type Corrections,
} from "./import-books";
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
 * the th of the spelling before 1901 as t (Theil, thun), a dotless i as i.
 */
function keyOf(word: string): string {
  return word
    .toLowerCase()
    .replace(/ı/gu, "i")
    .replace(/ß/gu, "ss")
    .replace(/th/gu, "t");
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
export function referenceText(raw: string): string {
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

/** A transcription's dashes and quotes as the Gesammelte Werke print them. */
function asPrinted(text: string): string {
  return text
    .replace(/--/gu, "—")
    .replace(/»/gu, "„")
    .replace(/«/gu, "“")
    .replace(/›/gu, "‚")
    .replace(/‹/gu, "‘");
}

/** A misread run is at most this many tokens; longer damage is read from the scan. */
const MAX_RUN = 4;
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
  const pairs = keys.slice(1).reduce((index, key, at) => {
    const pair = `${keys[at]} ${key}`;
    return index.set(pair, [...(index.get(pair) ?? []), at]);
  }, new Map<string, number[]>());

  const fix = (line: string, page: number | string): ReferenceCorrection[] => {
    const tokens = tokensOf(line);
    const flagged = tokens.map(
      (token, at) =>
        !vocabulary.has(token.key) &&
        // A word broken at either end of the line is half a word.
        !(at === 0 && /^\p{Ll}/u.test(line.trimStart())) &&
        !(at === tokens.length - 1 && /-\s*$/u.test(line)),
    );
    const runs = stretchesOf(flagged);
    return runs.flatMap(([first, last]) => {
      const before = [tokens[first - 2], tokens[first - 1]];
      const after = [tokens[last + 1], tokens[last + 2]];
      const [left2, left1] = before;
      const [right1, right2] = after;
      const run = tokens.slice(first, last + 1);
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
      const between = asPrinted(
        cleaned.slice(leftEnd.end, rightStart.start).replace(/\s+/gu, " "),
      );
      return [
        {
          page,
          from: line.slice(left2.start, right2.end),
          to: `${line.slice(left2.start, left1.end)}${between}${line.slice(right1.start, right2.end)}`,
        },
      ];
    });
  };

  return pages.flatMap(({ page, text }) =>
    text.split("\n").flatMap((line) => fix(line, page)),
  );
}

/** A word spelled as a word, used this often across the author's volumes, is real. */
const REAL_USES = 3;
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
  "Usage: bun packages/book-import/src/check-ocr.ts <manifest.yaml> [--correct] [--dictionary=<hunspell dictionary>]";

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
  const dictionary = args
    .find((arg) => arg.startsWith("--dictionary="))
    ?.slice(13);
  if (!manifestPath) {
    console.error(USAGE);
    process.exit(1);
  }
  const manifest = parseManifest(await readFile(manifestPath, "utf8"));
  if (manifest.source !== "archive-ocr") {
    console.error("The OCR check reads archive-ocr manifests.");
    process.exit(1);
  }
  const fetchText = createImporterFetch();
  const corrections = await readCorrectionsBeside(manifestPath);
  const items = [...new Set(manifest.books.map((book) => book.item))];
  const hocrs = new Map(
    await items.reduce<Promise<Array<[string, string]>>>(
      async (done, item) => [
        ...(await done),
        [item, await fetchVolumeHocr(item, fetchText)],
      ],
      Promise.resolve([]),
    ),
  );
  const textOf = (book: (typeof manifest.books)[number]): PageOfText[] =>
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
  const texts = new Map(
    manifest.books.map((book) => [book.slug, textOf(book)]),
  );
  const uses = [...texts.values()]
    .flat()
    .flatMap(({ text }) => wordsOf(text))
    .reduce(
      (tally, word) => tally.set(word, (tally.get(word) ?? 0) + 1),
      new Map<string, number>(),
    );
  const accepted = dictionary
    ? await dictionaryWords([...uses.keys()], dictionary)
    : new Set<string>();
  const isWord = (word: string): boolean =>
    accepted.has(word) ||
    (SPELLED.test(word) && (uses.get(word) ?? 0) >= REAL_USES);

  const added = await manifest.books
    .filter((book) => book.reference !== undefined)
    .reduce<Promise<Corrections>>(async (done, book) => {
      const found = await done;
      const reference = referenceText(await fetchText(book.reference ?? ""));
      const pages = texts.get(book.slug) ?? [];
      const checks = checkPages(pages, reference, isWord).filter(
        (check) => check.covered,
      );
      const words = checks.reduce((sum, check) => sum + check.words, 0);
      const wrong = checks.reduce((sum, check) => sum + check.wrong.length, 0);
      const passes = wrong * GATE < words;
      console.log(
        `${passes ? "pass" : "FAIL"} ${book.slug}: ${wrong} wrong in ${words} words${wrong ? ` (1 in ${Math.round(words / wrong)})` : ""}`,
      );
      if (!correct) return found;
      const existing = corrections[book.item] ?? [];
      const fixes = referenceCorrections(pages, reference, isWord).filter(
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
