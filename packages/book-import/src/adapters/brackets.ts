/** An editor's opening bracket and its words, up to the next bracket or the end. */
const OPENED = /\[[^[\]]*/gu;

/**
 * The text with the editor's closing brackets the Fraktur model reads as an
 * exclamation mark read as brackets again. A bracket it read twice, as the
 * mark and as itself, closes once ([dem Preise!]); an unclosed bracket closes
 * at the first mark after a word, the last of two where the text has its own
 * ([Schluß!!).
 */
export function closedBrackets(text: string): string {
  return text.replace(OPENED, (opened, at: number) =>
    text[at + opened.length] === "]"
      ? opened.replace(/(?<=\p{L})!$/u, "")
      : opened.replace(/(?<=\S)(!*)!/u, (_, own: string) => `${own}]`),
  );
}
