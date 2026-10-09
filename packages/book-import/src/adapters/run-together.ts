/** A word with a capital inside it: words the OCR ran together. */
const RUN_TOGETHER = /\p{L}*\p{Ll}\p{Lu}\p{L}*/gu;
/** The shortest word a run is parted into. */
const SHORTEST = 2;
/**
 * The German words of two letters; a run is parted into no other two
 * letters, which a text uses often only in quotations (le, mi, mc).
 */
const TWO_LETTERS = new Set(
  "ab am an da du eh er es im in ja je ob so um wo zu".split(" "),
);
/** A run shorter than this is as often an abbreviation (PsA), and stays. */
const SHORTEST_RUN = 5;
/** The fewest words after a run's last capital that make a phrase. */
const PHRASE = 3;
/** A word with a capital B after a small letter, as the OCR reads ß. */
const SHARP_S_AS_B = /\p{L}*\p{Ll}(?:ßB|Bß|B)\p{L}*/gu;

/**
 * The text with the ß the OCR read as B (daB, muBte, groBen) read as ß
 * again, where the text knows the word so; a ß it read twice (rißB) once.
 */
export function sharpened(text: string, common: Set<string>): string {
  return text.replace(SHARP_S_AS_B, (word) => {
    // A ß read twice is one ß, whatever the word.
    const once = word.replace(/ßB|Bß/gu, "ß");
    const sharp = once.replace(/(?<=\p{Ll})B/gu, "ß");
    return common.has(sharp.toLowerCase()) ? sharp : once;
  });
}

/**
 * A run of letters as the fewest of the text's common words that make it
 * up, in its own letters; null where no such words make it up.
 */
function segmented(run: string, common: Set<string>): string[] | null {
  const lower = run.toLowerCase();
  const from = (
    start: number,
    memo: Map<number, string[] | null>,
  ): string[] | null => {
    if (start === lower.length) return [];
    const known = memo.get(start);
    if (known !== undefined) return known;
    const best = Array.from(
      { length: lower.length - start - SHORTEST + 1 },
      (_, offset) => start + SHORTEST + offset,
    )
      .filter((end) => {
        const word = lower.slice(start, end);
        return word.length === 2 ? TWO_LETTERS.has(word) : common.has(word);
      })
      .map((end) => {
        const rest = from(end, memo);
        return rest === null ? null : [run.slice(start, end), ...rest];
      })
      .filter((words): words is string[] => words !== null)
      .sort((a, b) => a.length - b.length)[0];
    const found = best ?? null;
    memo.set(start, found);
    return found;
  };
  return from(0, new Map());
}

/**
 * The text with words the OCR ran together parted again: letter-spaced type
 * spaces its letters as widely as its words, and the OCR may read a spaced
 * phrase as one word (eineZeitlang). A capital inside a word marks it, as no
 * German compound has one; the run is parted at its capitals, and into the
 * text's common words, where the words before its last capital are all
 * common words, so a name (MacCulloch) stays whole.
 */
export function unjoined(text: string, common: Set<string>): string {
  return text.replace(RUN_TOGETHER, (word) => {
    if (word.length < SHORTEST_RUN) return word;
    const pieces = word.split(/(?<=\p{Ll})(?=\p{Lu})/u);
    const head = pieces.slice(0, -1).map((piece) => segmented(piece, common));
    if (head.some((words) => words === null)) return word;
    // The words after the last capital are parted only where three or more
    // make a phrase; two are as likely a compound (Affektverwandlung).
    const last = pieces.at(-1) ?? "";
    const tail = segmented(last, common);
    return [
      ...head.flatMap((words) => words ?? []),
      ...(tail !== null && tail.length >= PHRASE ? tail : [last]),
    ].join(" ");
  });
}
