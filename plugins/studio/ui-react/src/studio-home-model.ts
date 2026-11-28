import { slugify, truncateSlug } from "@brains/utils/string-utils";

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

/**
 * A note written in Home's box: its first line is its title and heading, the
 * rest its body, and its address comes from the title. None when the text
 * has nothing to name it by.
 */
export function noteFromText(
  text: string,
): { slug: string; title: string; body: string } | null {
  const [firstLine = "", ...lines] = text.trim().split("\n");
  const title = firstLine.trim().slice(0, 120);
  const slug = truncateSlug(slugify(title), 80);
  if (!slug) return null;
  const rest = lines.join("\n").trim();
  return { slug, title, body: rest ? `# ${title}\n\n${rest}` : `# ${title}` };
}
