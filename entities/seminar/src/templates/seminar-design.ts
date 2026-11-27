import type { SeminarPage } from "../datasources/seminar-datasource";

/** A seminar opens at /seminars/<id>. */
export function seminarHref(seminar: Pick<SeminarPage, "id">): string {
  return `/seminars/${seminar.id}`;
}

/** A peer's own site: the brain whose books its turns quote. */
export function peerHref(agent: string): string {
  return `https://${agent}`;
}

const DAY = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});

/** The day a seminar was asked, as a page writes it: 26 November 2026. */
export function formatDay(asked: string): string {
  const day = new Date(`${asked}T00:00:00Z`);
  return Number.isNaN(day.getTime()) ? asked : DAY.format(day);
}

/** A paragraph's first sentence; the whole of one that has no end mark. */
export function firstSentence(text: string): string {
  return /^.*?[.!?](?=\s|$)/su.exec(text.trim())?.[0] ?? text.trim();
}

/** Names as a sentence lists them: Marx; Marx and Freud; Marx, Nietzsche and Freud. */
export function nameList(names: readonly string[]): string {
  if (names.length <= 1) return names[0] ?? "";
  return `${names.slice(0, -1).join(", ")} and ${names.at(-1) ?? ""}`;
}

const NUMERALS: ReadonlyArray<readonly [number, string]> = [
  [1000, "m"],
  [900, "cm"],
  [500, "d"],
  [400, "cd"],
  [100, "c"],
  [90, "xc"],
  [50, "l"],
  [40, "xl"],
  [10, "x"],
  [9, "ix"],
  [5, "v"],
  [4, "iv"],
  [1, "i"],
];

/** A count in lowercase roman numerals, as the seminars are numbered. */
export function roman(count: number): string {
  return NUMERALS.reduce<{ left: number; written: string }>(
    (state, [value, numeral]) => ({
      left: state.left % value,
      written: state.written + numeral.repeat(Math.floor(state.left / value)),
    }),
    { left: count, written: "" },
  ).written;
}

function escaped(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}

/**
 * A turn's markdown with each source linked where the text names it. A peer
 * cites a section by its siglum or page in the text and returns it as a
 * source with its address; the page joins the two. A name that is already a
 * link, or part of a longer word, is left as written.
 */
export function linkedSources(
  text: string,
  sources: ReadonlyArray<{ title: string; url: string | null }>,
): string {
  const addresses = new Map<string, string>();
  for (const { title, url } of sources) {
    if (url !== null && !addresses.has(title)) addresses.set(title, url);
  }
  // Longest first, so a title that contains another is linked whole.
  const titles = [...addresses.keys()].sort(
    (left, right) => right.length - left.length,
  );
  if (titles.length === 0) return text;
  const named = new RegExp(
    `(?<![\\[\\w])(${titles.map(escaped).join("|")})(?![\\w]|\\]\\()`,
    "gu",
  );
  return text.replace(named, (title: string) => {
    const url = addresses.get(title);
    return url === undefined ? title : `[${title}](${url})`;
  });
}

export const seminarClasses = {
  frame: "mx-auto w-full max-w-[82rem] px-5 md:px-12",
  label:
    "font-mono text-[0.75rem] uppercase tracking-[0.08em] text-theme-light",
  rule: "border-t border-[var(--color-rule-strong)]",
  softRule: "border-[var(--color-rule)]",
  accent: "text-[var(--color-accent)]",
  cite: "font-mono text-[0.75rem] text-[var(--color-accent)] no-underline border-b border-[var(--color-accent-soft)] hover:border-[var(--color-accent)]",
  quiet:
    "text-theme-muted no-underline border-b border-[var(--color-rule-strong)] hover:text-[var(--color-accent)]",
} as const;
