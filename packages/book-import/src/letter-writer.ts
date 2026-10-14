/** How one writer's letters are known among the others in an edition. */
export interface LetterWriter {
  /** The writer's signatures, without the closing (Dein K. M. is K. M.). */
  signatures: string[];
  /** Salutations of the writer's letters, for a letter left unsigned. */
  salutations: string[];
}

/** A letter as its opening and close show who wrote it. */
export interface LetterEnds {
  salutation: string | null;
  signatures: string[];
}

/** Words that close a letter before the signature. */
export const CLOSING: RegExp = /^(?:(?:Dein|Deinem|Euer|Ihr|Ihre|Salut!)\s+)+/;

/** A signature's name, its closing words and the editors' brackets left out. */
function signed(signature: string): string {
  return signature
    .replace(/[[\]]/g, "")
    .replace(CLOSING, "")
    .replace(/\.$/, "")
    .trim();
}

/**
 * The writer's letter: one the writer signs, or, left unsigned (bar the
 * editors' bracketed remark), one that opens with the writer's salutation.
 * A signature in quotation marks closes a letter the writer quotes.
 */
export function isWritersLetter(
  letter: LetterEnds,
  writer: LetterWriter,
): boolean {
  const own = letter.signatures.filter((signature) => !/[“"]$/.test(signature));
  const names = writer.signatures.map(signed);
  if (own.some((signature) => names.includes(signed(signature)))) return true;
  const unsigned = own.every((signature) => /^\[.*\]$/.test(signature));
  return unsigned && writer.salutations.includes(letter.salutation ?? "");
}
