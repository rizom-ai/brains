import {
  generateMarkdownWithFrontmatter,
  parseMarkdownWithFrontmatter,
  parseTypedFrontmatter,
} from "@brains/sdk/internal/entity-runtime";
import { z } from "@brains/utils/zod";
import {
  mailItemFrontmatterSchema,
  type MailItemEntity,
  type MailItemFrontmatter,
} from "../schemas/mail-item";

const mailItemSummarySchema = z.string().min(1).max(1_000);
const frontmatterRecordSchema = z.record(z.string(), z.unknown());

/**
 * How a mail item's document is written and read: the routing fields and
 * the source in its header, the content-safe summary as its body, and the
 * routing fields and thread position as its metadata. What triage, the
 * projection and the declared type write and read with.
 */
export const mailItemAdapter: {
  createMailItemContent(
    frontmatter: MailItemFrontmatter,
    summary: string,
  ): string;
  parseMailItemContent(content: string): {
    frontmatter: MailItemFrontmatter;
    summary: string;
  };
  fromMarkdown(markdown: string): Partial<MailItemEntity>;
} = Object.freeze({
  createMailItemContent(
    frontmatter: MailItemFrontmatter,
    summary: string,
  ): string {
    return generateMarkdownWithFrontmatter(
      mailItemSummarySchema.parse(summary),
      mailItemFrontmatterSchema.parse(frontmatter),
    );
  },

  parseMailItemContent(content: string): {
    frontmatter: MailItemFrontmatter;
    summary: string;
  } {
    return {
      frontmatter: parseTypedFrontmatter(
        "mail-item",
        content,
        mailItemFrontmatterSchema,
      ),
      summary: mailItemSummarySchema.parse(
        parseMarkdownWithFrontmatter(
          content,
          frontmatterRecordSchema,
        ).content.trim(),
      ),
    };
  },

  fromMarkdown(markdown: string): Partial<MailItemEntity> {
    const { frontmatter } = mailItemAdapter.parseMailItemContent(markdown);
    return {
      content: markdown,
      entityType: "mail-item",
      metadata: {
        title: frontmatter.title,
        category: frontmatter.category,
        priority: frontmatter.priority,
        status: frontmatter.status,
        needsReply: frontmatter.needsReply,
        receivedAt: frontmatter.receivedAt,
        ...(frontmatter.source.threadKey
          ? { threadKey: frontmatter.source.threadKey }
          : {}),
        ...(frontmatter.source.threadOrdinal !== undefined
          ? { threadOrdinal: frontmatter.source.threadOrdinal }
          : {}),
      },
    };
  },
});
