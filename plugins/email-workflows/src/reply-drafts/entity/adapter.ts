import {
  generateMarkdownWithFrontmatter,
  parseMarkdownWithFrontmatter,
  parseTypedFrontmatter,
} from "@brains/sdk/internal/entity-runtime";
import { z } from "@brains/utils/zod";
import {
  emailReplyDraftFrontmatterSchema,
  emailReplyTextSchema,
  type EmailReplyDraftEntity,
  type EmailReplyDraftFrontmatter,
} from "./schema";

const frontmatterRecordSchema = z.record(z.string(), z.unknown());

/**
 * How a reply draft's document is written and read: its state and
 * delivery in its header, the reply as its body. What the drafting
 * operator and the declared type write and read with.
 */
export const emailReplyDraftAdapter: {
  createContent(
    frontmatter: EmailReplyDraftFrontmatter,
    replyText: string,
  ): string;
  parseContent(content: string): {
    frontmatter: EmailReplyDraftFrontmatter;
    replyText: string;
  };
  fromMarkdown(markdown: string): Partial<EmailReplyDraftEntity>;
} = Object.freeze({
  createContent(
    frontmatter: EmailReplyDraftFrontmatter,
    replyText: string,
  ): string {
    const parsedFrontmatter =
      emailReplyDraftFrontmatterSchema.parse(frontmatter);
    assertDraftState(parsedFrontmatter);
    return generateMarkdownWithFrontmatter(
      emailReplyTextSchema.parse(replyText),
      parsedFrontmatter,
    );
  },

  parseContent(content: string): {
    frontmatter: EmailReplyDraftFrontmatter;
    replyText: string;
  } {
    const frontmatter = parseTypedFrontmatter(
      "email-reply-draft",
      content,
      emailReplyDraftFrontmatterSchema,
    );
    assertDraftState(frontmatter);
    return {
      frontmatter,
      replyText: emailReplyTextSchema.parse(
        parseMarkdownWithFrontmatter(
          content,
          frontmatterRecordSchema,
        ).content.trim(),
      ),
    };
  },

  fromMarkdown(markdown: string): Partial<EmailReplyDraftEntity> {
    const { frontmatter } = emailReplyDraftAdapter.parseContent(markdown);
    return {
      content: markdown,
      entityType: "email-reply-draft",
      metadata: frontmatter,
    };
  },
});

function assertDraftState(frontmatter: EmailReplyDraftFrontmatter): void {
  if (frontmatter.status === "sent" && !frontmatter.sentAt) {
    throw new Error("Sent email reply drafts require a sent timestamp");
  }
  if (
    frontmatter.status === "draft" &&
    (frontmatter.sentAt !== undefined ||
      frontmatter.providerDeliveryId !== undefined)
  ) {
    throw new Error("Unsent email reply drafts cannot have delivery metadata");
  }
}
