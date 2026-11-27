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

/** A peer's turn as a later message quotes it: who, then what he said. */
export interface QuotedTurn {
  name: string;
  text: string;
}

/**
 * What a challenger is given: the question, the opening he must answer as
 * its author gave it, and the chair's follow-up to him. A peer keeps
 * nothing between turns, so each message carries all it answers.
 */
export function challengeMessage(input: {
  question: string;
  stands: QuotedTurn;
  followUp: string;
  language: string;
}): string {
  return [
    `The question before the seminar: ${input.question}`,
    `${input.stands.name} answered:`,
    input.stands.text,
    input.followUp,
    closingLines(input.language),
  ].join("\n\n");
}

/**
 * What the one who stands is given: the question, his own opening, each
 * challenge as its author gave it, and the chair's follow-up to him.
 */
export function rejoinderMessage(input: {
  question: string;
  opening: string;
  challenges: readonly QuotedTurn[];
  followUp: string;
  language: string;
}): string {
  return [
    `The question before the seminar: ${input.question}`,
    "You answered:",
    input.opening,
    ...input.challenges.flatMap(({ name, text }) => [
      `${name} answers you:`,
      text,
    ]),
    input.followUp,
    closingLines(input.language),
  ].join("\n\n");
}

/** The question as an opening puts it to a peer. */
export function openingMessage(question: string, language: string): string {
  return `${question}\n\n${closingLines(language)}`;
}
