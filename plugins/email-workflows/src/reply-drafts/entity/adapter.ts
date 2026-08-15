import { BaseEntityAdapter } from "@brains/plugins";
import {
  emailReplyDraftFrontmatterSchema,
  emailReplyDraftSchema,
  emailReplyTextSchema,
  type EmailReplyDraftEntity,
  type EmailReplyDraftFrontmatter,
  type EmailReplyDraftMetadata,
} from "./schema";

export class EmailReplyDraftAdapter extends BaseEntityAdapter<
  EmailReplyDraftEntity,
  EmailReplyDraftMetadata,
  EmailReplyDraftFrontmatter
> {
  constructor() {
    super({
      entityType: "email-reply-draft",
      purpose:
        "An operator-editable reply authored by Brain without a copy of the source email.",
      schema: emailReplyDraftSchema,
      frontmatterSchema: emailReplyDraftFrontmatterSchema,
    });
  }

  createContent(
    frontmatter: EmailReplyDraftFrontmatter,
    replyText: string,
  ): string {
    return this.buildMarkdown(
      emailReplyTextSchema.parse(replyText),
      emailReplyDraftFrontmatterSchema.parse(frontmatter),
    );
  }

  parseContent(content: string): {
    frontmatter: EmailReplyDraftFrontmatter;
    replyText: string;
  } {
    return {
      frontmatter: this.parseFrontMatter(
        content,
        emailReplyDraftFrontmatterSchema,
      ),
      replyText: emailReplyTextSchema.parse(this.extractBody(content).trim()),
    };
  }

  fromMarkdown(markdown: string): Partial<EmailReplyDraftEntity> {
    const { frontmatter } = this.parseContent(markdown);
    return {
      content: markdown,
      entityType: "email-reply-draft",
      metadata: frontmatter,
    };
  }
}

export const emailReplyDraftAdapter: EmailReplyDraftAdapter =
  new EmailReplyDraftAdapter();
