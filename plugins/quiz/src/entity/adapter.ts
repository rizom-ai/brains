import {
  generateMarkdownWithFrontmatter,
  parseTypedFrontmatter,
} from "@brains/sdk/internal/entity-runtime";
import {
  quizResultFrontmatterSchema,
  type QuizResult,
  type QuizResultFrontmatter,
  type QuizResultMetadata,
} from "./schema";

/**
 * How a quiz result's document is written and read: what was asked,
 * answered and shown in its header, and what results are queried by as
 * its metadata. What the quiz target and the declared type write and read
 * with; errors never carry submitted content.
 */
export const quizResultAdapter: {
  createContent(frontmatter: QuizResultFrontmatter): string;
  parseContent(content: string): { frontmatter: QuizResultFrontmatter };
  metadataFor(frontmatter: QuizResultFrontmatter): QuizResultMetadata;
  fromMarkdown(markdown: string): Partial<QuizResult>;
} = Object.freeze({
  createContent(frontmatter: QuizResultFrontmatter): string {
    try {
      return generateMarkdownWithFrontmatter(
        "",
        quizResultFrontmatterSchema.parse(frontmatter),
      );
    } catch {
      // Persistence errors may be logged by callers. Never include submitted content.
      throw new Error("Invalid quiz result");
    }
  },

  parseContent(content: string): { frontmatter: QuizResultFrontmatter } {
    try {
      return {
        frontmatter: parseTypedFrontmatter(
          "quiz-result",
          content,
          quizResultFrontmatterSchema,
        ),
      };
    } catch {
      // YAML errors can echo source lines containing personal information.
      throw new Error("Invalid quiz result");
    }
  },

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
  },

  fromMarkdown(markdown: string): Partial<QuizResult> {
    const { frontmatter } = quizResultAdapter.parseContent(markdown);
    return {
      entityType: "quiz-result",
      visibility: "restricted",
      content: markdown,
      metadata: quizResultAdapter.metadataFor(frontmatter),
    };
  },
});
