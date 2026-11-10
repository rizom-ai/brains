import { BaseEntityAdapter } from "@brains/plugins";
import {
  quizResultFrontmatterSchema,
  quizResultSchema,
  type QuizResult,
  type QuizResultFrontmatter,
  type QuizResultMetadata,
} from "./schema";

export class QuizResultAdapter extends BaseEntityAdapter<
  QuizResult,
  QuizResultMetadata,
  QuizResultFrontmatter
> {
  constructor() {
    super({
      entityType: "quiz-result",
      purpose:
        "A restricted record of one quiz taken on the brain's site: what was asked and answered, and the results shown. Never public knowledge or model input.",
      schema: quizResultSchema,
      frontmatterSchema: quizResultFrontmatterSchema,
    });
  }

  createContent(frontmatter: QuizResultFrontmatter): string {
    try {
      return this.buildMarkdown(
        "",
        quizResultFrontmatterSchema.parse(frontmatter),
      );
    } catch {
      // Persistence errors may be logged by callers. Never include submitted content.
      throw new Error("Invalid quiz result");
    }
  }

  parseContent(content: string): { frontmatter: QuizResultFrontmatter } {
    try {
      return {
        frontmatter: this.parseFrontMatter(
          content,
          quizResultFrontmatterSchema,
        ),
      };
    } catch {
      // YAML errors can echo source lines containing personal information.
      throw new Error("Invalid quiz result");
    }
  }

  /** What results are queried by; listed under their quiz's title as it
   * was taken, or, for a result that predates keeping it, the quiz's id. */
  metadataFor(frontmatter: QuizResultFrontmatter): QuizResultMetadata {
    return {
      title: frontmatter.quizTitle ?? frontmatter.quiz,
      quiz: frontmatter.quiz,
      receivedAt: frontmatter.receivedAt,
      status: frontmatter.status,
      notification: frontmatter.notification,
      contact: frontmatter.email !== undefined,
    };
  }

  fromMarkdown(markdown: string): Partial<QuizResult> {
    const { frontmatter } = this.parseContent(markdown);
    return {
      entityType: "quiz-result",
      visibility: "restricted",
      content: markdown,
      metadata: this.metadataFor(frontmatter),
    };
  }
}

export const quizResultAdapter: QuizResultAdapter = new QuizResultAdapter();
