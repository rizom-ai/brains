const WORDS = [
  "no",
  "one",
  "two",
  "three",
  "four",
  "five",
  "six",
  "seven",
  "eight",
  "nine",
  "ten",
];

/** Small counts read as words, larger ones as figures. */
function count(value: number): string {
  return WORDS[value] ?? String(value);
}

function capitalized(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/**
 * The sentence Home opens on: how much needs the person, and how many drafts
 * wait, so a calm day reads as calm.
 */
export function homeSentence(input: { needs: number; drafts: number }): string {
  const needs =
    input.needs === 0
      ? "Nothing needs you"
      : `${capitalized(count(input.needs))} ${input.needs === 1 ? "thing needs" : "things need"} you`;
  const drafts =
    input.drafts === 0
      ? ""
      : `, and ${count(input.drafts)} ${input.drafts === 1 ? "draft is" : "drafts are"} waiting`;
  return `${needs}${drafts}.`;
}

/** The day Home was composed, as the person reads dates. */
export function homeDate(
  iso: string,
  locale?: string,
  timeZone?: string,
): string {
  return new Intl.DateTimeFormat(locale, {
    weekday: "long",
    day: "numeric",
    month: "long",
    ...(timeZone ? { timeZone } : {}),
  })
    .format(new Date(iso))
    .replace(",", "");
}
