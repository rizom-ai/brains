/**
 * The most of an entity's text a search result carries. A longer entity's
 * result carries the sections that match the query instead, so a search over
 * long documents costs the agent what it asked about, not every page whole.
 */
export const MAX_SEARCH_CONTENT_CHARS = 3_000;

const GAP = "\n\n…\n\n";
const STOP_WORDS = new Set([
  "about",
  "and",
  "are",
  "can",
  "does",
  "for",
  "from",
  "how",
  "into",
  "the",
  "this",
  "what",
  "when",
  "where",
  "which",
  "who",
  "why",
  "with",
  "you",
  "your",
]);

/** The words that carry a text: lowercase, three letters or more, singular. */
function words(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .split(/[^\p{L}\p{N}]+/u)
      .filter((word) => word.length >= 3 && !STOP_WORDS.has(word))
      .map((word) =>
        word.length > 3 && word.endsWith("s") ? word.slice(0, -1) : word,
      ),
  );
}

interface Section {
  index: number;
  heading: string;
  text: string;
}

const HEADING = /^#{1,6}\s/;
const FENCE = /^\s*(```|~~~)/;

/** A Markdown body cut at its headings; a fenced block never splits. */
function sections(body: string): Section[] {
  const lines = body.split("\n");
  // One pass, so a long text costs its length: the lines that open a section.
  const { starts } = lines.reduce<{ inFence: boolean; starts: number[] }>(
    (state, line, index) => {
      if (!state.inFence && index > 0 && HEADING.test(line)) {
        state.starts.push(index);
      }
      if (FENCE.test(line)) state.inFence = !state.inFence;
      return state;
    },
    { inFence: false, starts: [] },
  );
  const bounds = [0, ...starts, lines.length];
  return bounds
    .slice(0, -1)
    .map((from, position) =>
      lines
        .slice(from, bounds[position + 1])
        .join("\n")
        .trim(),
    )
    .filter((text) => text.length > 0)
    .map((text, index) => ({
      index,
      heading: HEADING.test(text) ? (text.split("\n")[0] ?? "") : "",
      text,
    }));
}

/** How much of the query a section answers; its heading counts twice. */
function relevance(query: Set<string>, section: Section): number {
  const heading = words(section.heading);
  const text = words(section.text);
  return Array.from(query).reduce(
    (score, word) =>
      score + (text.has(word) ? 1 : 0) + (heading.has(word) ? 1 : 0),
    0,
  );
}

/** The start of a text within `maxChars`, cut at a word and marked. */
function cut(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  const head = text.slice(0, maxChars - 1);
  const atWord = head.slice(0, Math.max(head.lastIndexOf(" "), 1)).trimEnd();
  return `${atWord}…`;
}

/**
 * The sections of a Markdown body that best match a query, within
 * `maxChars`, in document order with the gaps between them marked. With no
 * matching section, the body's start.
 */
export function matchingSections(
  body: string,
  query: string,
  maxChars: number = MAX_SEARCH_CONTENT_CHARS,
): string {
  if (body.length <= maxChars) return body;
  const asked = words(query);
  const ranked = sections(body)
    .map((section) => ({ section, score: relevance(asked, section) }))
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score || a.section.index - b.section.index)
    .map(({ section }) => section);
  const [best] = ranked;
  if (!best) return cut(body.trim(), maxChars);
  if (best.text.length > maxChars) return cut(best.text, maxChars);

  // Each kept section costs its text and, at most, the gap before it.
  const { kept } = ranked.reduce<{ used: number; kept: Section[] }>(
    (state, section) => {
      const cost =
        section.text.length + (state.kept.length > 0 ? GAP.length : 0);
      return state.used + cost <= maxChars
        ? { used: state.used + cost, kept: [...state.kept, section] }
        : state;
    },
    { used: 0, kept: [] },
  );
  return kept
    .sort((a, b) => a.index - b.index)
    .map((section, position, ordered) => {
      const previous = ordered[position - 1];
      if (!previous) return section.text;
      const joint = section.index === previous.index + 1 ? "\n\n" : GAP;
      return `${joint}${section.text}`;
    })
    .join("");
}
