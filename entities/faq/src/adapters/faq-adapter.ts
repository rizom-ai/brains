import { BaseEntityAdapter } from "@brains/plugins";
import {
  faqFrontmatterSchema,
  faqSchema,
  type FaqEntity,
  type FaqFrontmatter,
  type FaqMetadata,
} from "../schemas/faq";

/** The query-friendly metadata a FAQ's frontmatter implies. */
export function faqMetadata(frontmatter: FaqFrontmatter): FaqMetadata {
  return {
    question: frontmatter.question,
    status: frontmatter.status,
    asked: 1 + frontmatter.mergedMessageIds.length,
  };
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

  public createFaqContent(frontmatter: FaqFrontmatter, answer: string): string {
    return this.buildMarkdown(answer, frontmatter);
  }

  public parseFaqContent(content: string): {
    frontmatter: FaqFrontmatter;
    answer: string;
  } {
    // Parse through the schema to apply defaults (mergedMessageIds)
    const raw = this.parseFrontMatter(content, faqFrontmatterSchema);
    return {
      frontmatter: faqFrontmatterSchema.parse(raw),
      answer: this.extractBody(content).trim(),
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
