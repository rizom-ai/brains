/**
 * What every message to a peer ends with: where its answer comes from, and
 * the language of the answer. The language is stated, never inferred: a
 * message full of another language's quotes and titles reads as written in
 * that language.
 */
export function closingLines(language: string): string {
  return [
    "Answer from your own works and cite each section you draw on.",
    `Answer in ${language}; keep quotes in the language of their text.`,
  ].join("\n");
}

/** The question as an opening puts it to a peer. */
export function openingMessage(question: string, language: string): string {
  return `${question}\n\n${closingLines(language)}`;
}
