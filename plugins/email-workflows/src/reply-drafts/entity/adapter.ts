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
    const parsedFrontmatter =
      emailReplyDraftFrontmatterSchema.parse(frontmatter);
    assertDraftState(parsedFrontmatter);
    return this.buildMarkdown(
      emailReplyTextSchema.parse(replyText),
      parsedFrontmatter,
    );
  }

  parseContent(content: string): {
    frontmatter: EmailReplyDraftFrontmatter;
    replyText: string;
  } {
    const frontmatter = this.parseFrontMatter(
      content,
      emailReplyDraftFrontmatterSchema,
    );
    assertDraftState(frontmatter);
    return {
      frontmatter,
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
