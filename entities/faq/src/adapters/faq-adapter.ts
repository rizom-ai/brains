import { BaseEntityAdapter } from "@brains/plugins";
import {
  faqFrontmatterSchema,
  faqSchema,
  type FaqAlternative,
  type FaqEntity,
  type FaqFrontmatter,
  type FaqFrontmatterInput,
  type FaqMetadata,
} from "../schemas/faq";

/** Heading that separates the answer from the alternatives in the body. */
const ALTERNATIVES_HEADING = "## Alternative answers";
const ALTERNATIVES_HEADING_LINE = /^## Alternative answers[ \t]*$/m;

/** Any heading of an alternative section; owners may rename them. */
const ALTERNATIVE_HEADING_LINE = /^### .*$/m;

/** The query-friendly metadata a FAQ's frontmatter implies. */
export function faqMetadata(frontmatter: FaqFrontmatter): FaqMetadata {
  return {
    question: frontmatter.question,
    status: frontmatter.status,
    asked: frontmatter.asked,
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
      alternative.answer.trim(),
    ]),
  ].join("\n");
}

/** Split a body into the answer and the alternatives below the heading. */
function parseFaqBody(body: string): {
  answer: string;
  alternatives: FaqAlternative[];
} {
  const [answer = "", section] = body.split(ALTERNATIVES_HEADING_LINE);
  if (section === undefined) return { answer: answer.trim(), alternatives: [] };

  // The text before the first heading is not an alternative.
  const alternatives = section
    .split(ALTERNATIVE_HEADING_LINE)
    .slice(1)
    .map((text) => ({ answer: text.trim() }))
    .filter((alternative) => alternative.answer.length > 0);
  return { answer: answer.trim(), alternatives };
}

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
      faqBody(answer, alternatives),
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
      ...parseFaqBody(this.extractBody(content)),
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
