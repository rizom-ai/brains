import {
  generateMarkdownWithFrontmatter,
  parseMarkdown,
} from "@brains/sdk/entities";
import {
  faqFrontmatterSchema,
  type FaqAlternative,
  type FaqFrontmatter,
  type FaqFrontmatterInput,
  type FaqMetadata,
} from "../schemas/faq";

const ALTERNATIVES_HEADING = "## Alternative answers";
const ALTERNATIVES_HEADING_LINE = /^## Alternative answers[ \t]*$/m;
const ALTERNATIVE_HEADING = /^### /;
const SECTION_LEVEL_HEADING = /^#{1,3}(?=\s)/;
const CODE_FENCE = /^\s*(```|~~~)/;

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

/** Nest an alternative's headings inside its section, leaving code alone. */
function nestHeadings(text: string): string {
  return markdownLines(text)
    .map(({ line, inCode }) =>
      inCode ? line : line.replace(SECTION_LEVEL_HEADING, "####"),
    )
    .join("\n");
}

/** The query-friendly metadata implied by the authored document. */
export function faqMetadata(frontmatter: FaqFrontmatter): FaqMetadata {
  return {
    question: frontmatter.question,
    status: frontmatter.status,
    asked: frontmatter.asked,
    ...(frontmatter.rank !== undefined && { rank: frontmatter.rank }),
  };
}

function faqBody(answer: string, alternatives: FaqAlternative[]): string {
  if (alternatives.length === 0) return answer.trim();
  return [
    answer.trim(),
    "",
    ALTERNATIVES_HEADING,
    ...alternatives.flatMap((alternative, index) => [
      "",
      `### Alternative ${index + 1}`,
      "",
      nestHeadings(alternative.answer.trim()),
    ]),
  ].join("\n");
}

function parseFaqBody(body: string): {
  answer: string;
  alternatives: FaqAlternative[];
} {
  const [answer = "", section] = body.split(ALTERNATIVES_HEADING_LINE);
  if (section === undefined) return { answer: answer.trim(), alternatives: [] };
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

export function createFaqContent(
  frontmatter: FaqFrontmatterInput,
  answer: string,
  alternatives: FaqAlternative[] = [],
): string {
  return generateMarkdownWithFrontmatter(
    faqBody(answer, alternatives),
    faqFrontmatterSchema.parse(frontmatter),
  );
}

/** Only the chosen answer appears above the alternative-answer sections. */
export function parseFaqContent(content: string): {
  frontmatter: FaqFrontmatter;
  answer: string;
  alternatives: FaqAlternative[];
} {
  const parsed = parseMarkdown(content);
  return {
    frontmatter: faqFrontmatterSchema.parse(parsed.frontmatter),
    ...parseFaqBody(parsed.content),
  };
}
