/**
 * The space that sets a run of words off from the emphasis after it, which
 * Chinese writes without: none after a Han character or CJK punctuation,
 * none after nothing, else one.
 */
const CJK_END = /[\p{Script=Han}\u3000-\u303f\uff00-\uffef]$/u;

export function spaceAfter(text: string): string {
  return text === "" || CJK_END.test(text) ? "" : " ";
}
