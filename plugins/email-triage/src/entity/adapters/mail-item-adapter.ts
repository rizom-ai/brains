import { BaseEntityAdapter } from "@brains/plugins";
import { z } from "@brains/utils/zod";
import {
  mailItemFrontmatterSchema,
  mailItemSchema,
  type MailItemEntity,
  type MailItemFrontmatter,
  type MailItemMetadata,
} from "../schemas/mail-item";

const mailItemSummarySchema = z.string().min(1).max(1_000);

export class MailItemAdapter extends BaseEntityAdapter<
  MailItemEntity,
  MailItemMetadata,
  MailItemFrontmatter
> {
  constructor() {
    super({
      entityType: "mail-item",
      purpose:
        "A restricted, derived routing summary for an inbound email whose original remains in the mailbox.",
      schema: mailItemSchema,
      frontmatterSchema: mailItemFrontmatterSchema,
    });
  }

  public createMailItemContent(
    frontmatter: MailItemFrontmatter,
    summary: string,
  ): string {
    return this.buildMarkdown(
      mailItemSummarySchema.parse(summary),
      mailItemFrontmatterSchema.parse(frontmatter),
    );
  }

  public parseMailItemContent(content: string): {
    frontmatter: MailItemFrontmatter;
    summary: string;
  } {
    return {
      frontmatter: this.parseFrontMatter(content, mailItemFrontmatterSchema),
      summary: mailItemSummarySchema.parse(this.extractBody(content).trim()),
    };
  }

  public fromMarkdown(markdown: string): Partial<MailItemEntity> {
    const { frontmatter } = this.parseMailItemContent(markdown);
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
      },
    };
  }
}

export const mailItemAdapter: MailItemAdapter = new MailItemAdapter();
