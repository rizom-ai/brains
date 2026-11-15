import type { FaqAlternative } from "../schemas/faq";

/*
 * Reading FAQ bodies stored before they used the structured content
 * formatter (legacy): the answer at the top, then "## Alternative answers"
 * with one "###" section per alternative. The next write stores the
 * formatter's layout; see docs/legacy-code-inventory.json.
 */

const ALTERNATIVES_HEADING_LINE = /^## Alternative answers[ \t]*$/m;

/** Any heading of an alternative section; owners may rename them. */
const ALTERNATIVE_HEADING = /^### /;

const CODE_FENCE = /^\s*(```|~~~)/;

/** A body in the formatter's layout always has its answer under a heading. */
const ANSWER_HEADING_LINE = /^## Answer[ \t]*$/m;

export function isStoredFaqBody(body: string): boolean {
  return !ANSWER_HEADING_LINE.test(body);
}

/** Each line of `markdown`, and whether it sits in a fenced code block. */
function markdownLines(
  markdown: string,
): Array<{ line: string; inCode: boolean }> {
  return markdown.split("\n").reduce<{
    inCode: boolean;
    lines: Array<{ line: string; inCode: boolean }>;
  }>(
    (state, line) => {
      const fence = CODE_FENCE.test(line);
      state.lines.push({ line, inCode: state.inCode || fence });
      return {
        inCode: fence ? !state.inCode : state.inCode,
        lines: state.lines,
      };
    },
    { inCode: false, lines: [] },
  ).lines;
}

/** The answer and alternatives of a body in the layout before the formatter. */
export function parseStoredFaqBody(body: string): {
  answer: string;
  alternatives: FaqAlternative[];
} {
  const [answer = "", section] = body.split(ALTERNATIVES_HEADING_LINE);
  if (section === undefined) return { answer: answer.trim(), alternatives: [] };
  // Each "###" heading outside code opens an alternative; the text before the
  // first one is not an alternative.
  const alternatives = markdownLines(section)
    .reduce<string[][]>((sections, { line, inCode }) => {
      if (!inCode && ALTERNATIVE_HEADING.test(line)) sections.push([]);
      else sections.at(-1)?.push(line);
      return sections;
    }, [])
    .map((lines) => ({ answer: lines.join("\n").trim() }))
    .filter((alternative) => alternative.answer.length > 0);
  return { answer: answer.trim(), alternatives };
}

/*
 * Sources once kept what they quoted (legacy) as "> " lines under their list
 * item. The quotes are read past, and the next write leaves them out.
 */
const STORED_EXCERPT_LINE = /^\s*>/;

/** The Sources section's markdown without the quotes sources kept before. */
export function withoutStoredExcerpts(sources: string): string {
  return sources
    .split("\n")
    .filter((line) => !STORED_EXCERPT_LINE.test(line))
    .join("\n");
}

/** Whether a body's Sources section still keeps quotes. */
export function hasStoredExcerpts(body: string): boolean {
  const sources = body.split(/^## Sources[ \t]*$/m)[1]?.split(/^## /m)[0];
  return sources !== undefined && withoutStoredExcerpts(sources) !== sources;
}
