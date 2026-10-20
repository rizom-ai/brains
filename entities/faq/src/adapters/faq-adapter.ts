import { BaseEntityAdapter } from "@brains/plugins";
import { z } from "@brains/utils/zod";
import {
  faqBodySchema,
  faqFrontmatterSchema,
  faqSchema,
  type FaqAlternative,
  type FaqBody,
  type FaqEntity,
  type FaqFrontmatter,
  type FaqFrontmatterInput,
  type FaqMetadata,
} from "../schemas/faq";

/** Heading that separates the answer from the alternatives in the body. */
const ALTERNATIVES_HEADING = "## Alternative answers";
const ALTERNATIVES_HEADING_LINE = /^## Alternative answers[ \t]*$/m;

/** Any heading of an alternative section; owners may rename them. */
const ALTERNATIVE_HEADING = /^### /;

/** A heading an alternative's own text may not use: it would open a section. */
const SECTION_LEVEL_HEADING = /^#{1,3}(?=\s)/;

const CODE_FENCE = /^\s*(```|~~~)/;

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

/**
 * Nest an alternative's own headings below its "###" section, so they stay
 * part of it; code blocks are left as written.
 */
function nestHeadings(text: string): string {
  return markdownLines(text)
    .map(({ line, inCode }) =>
      inCode ? line : line.replace(SECTION_LEVEL_HEADING, "####"),
    )
    .join("\n");
}

/** The query-friendly metadata a FAQ's frontmatter implies. */
export function faqMetadata(frontmatter: FaqFrontmatter): FaqMetadata {
  return {
    question: frontmatter.question,
    status: frontmatter.status,
    asked: frontmatter.asked,
    ...(frontmatter.rank !== undefined && { rank: frontmatter.rank }),
  };
}

/** The body: the answer, then any alternatives as markdown sections. */
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

/** Split a body into the answer and the alternatives below the heading. */
function parseFaqBody(body: string): FaqBody {
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

/** Markdown body ↔ FAQ body; a write is validated like a read. */
export const faqBodyCodec: z.ZodCodec<z.ZodString, typeof faqBodySchema> =
  z.codec(z.string(), faqBodySchema, {
    decode: parseFaqBody,
    encode: ({ answer, alternatives }) => faqBody(answer, alternatives),
  });

export class FaqAdapter extends BaseEntityAdapter<
  FaqEntity,
  FaqMetadata,
  FaqFrontmatter
> {
  constructor() {
    super({
      entityType: "faq",
      purpose:
        "A reusable question and answer captured from a chat conversation, kept at the visibility of the turn that answered it.",
      schema: faqSchema,
      frontmatterSchema: faqFrontmatterSchema,
    });
  }

  public createFaqContent(
    frontmatter: FaqFrontmatterInput,
    answer: string,
    alternatives: FaqAlternative[] = [],
  ): string {
    return this.buildMarkdown(
      z.encode(faqBodyCodec, { answer, alternatives }),
      faqFrontmatterSchema.parse(frontmatter),
    );
  }

  /**
   * The answer is the body above "## Alternative answers"; each
   * "###" section below it is one alternative.
   */
  public parseFaqContent(content: string): {
    frontmatter: FaqFrontmatter;
    answer: string;
    alternatives: FaqAlternative[];
  } {
    // Parse through the schema to apply defaults (asked)
    const raw = this.parseFrontMatter(content, faqFrontmatterSchema);
    return {
      frontmatter: faqFrontmatterSchema.parse(raw),
      ...z.decode(faqBodyCodec, this.extractBody(content)),
    };
  }

  public fromMarkdown(markdown: string): Partial<FaqEntity> {
    const { frontmatter } = this.parseFaqContent(markdown);
    return {
      content: markdown,
      entityType: "faq",
      metadata: faqMetadata(frontmatter),
    };
  }
}

export const faqAdapter: FaqAdapter = new FaqAdapter();
