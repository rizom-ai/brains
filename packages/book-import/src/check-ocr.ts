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
            .filter(({ index }) => !vocabulary.has(keys[index] ?? ""))
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
