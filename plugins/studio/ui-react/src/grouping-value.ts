/** Shown where a space would otherwise be invisible. */
const SPACE_MARK = "·";
const EMPTY_LABEL = "(empty)";

function escapeUnit(character: string): string {
  if (character === "\\") return "\\\\";
  return `\\u${(character.codePointAt(0) ?? 0).toString(16).padStart(4, "0")}`;
}

/**
 * Presentation only: never use this label as a membership or URL value.
 *
 * Ordinary names, punctuation and single interior spaces read as themselves.
 * Only what a reader could not otherwise see is marked: edge and repeated
 * spaces become a middle dot, and control, format and exotic whitespace
 * characters become escapes. Distinct values keep distinct labels.
 */
export function groupingValueLabel(value: string): string {
  if (value === "") return EMPTY_LABEL;
  // Reserve the empty marker without conflating it with an authored name.
  if (value === EMPTY_LABEL) return `${escapeUnit("(")}${value.slice(1)}`;
  const escaped = value.replace(/\\|·|[^\S ]|\p{Cc}|\p{Cf}/gu, escapeUnit);
  return escaped.replace(/^ +| +$| {2,}/g, (run) =>
    SPACE_MARK.repeat(run.length),
  );
}
