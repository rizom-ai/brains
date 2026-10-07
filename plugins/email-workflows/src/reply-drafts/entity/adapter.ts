import {
  generateMarkdownWithFrontmatter,
  parseMarkdownWithFrontmatter,
  z,
} from "@brains/sdk/entities";
import { stripVisibility } from "../../entity/adapters/mail-item-adapter";
import {
  emailReplyDraftFrontmatterSchema,
  emailReplyTextSchema,
  type EmailReplyDraftFrontmatter,
  type EmailReplyDraftMetadata,
} from "./schema";

const frontmatterRecordSchema = z.record(z.string(), z.unknown());

export function assertDraftState(
  frontmatter: EmailReplyDraftFrontmatter,
): void {
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

export function createContent(
  frontmatter: EmailReplyDraftFrontmatter,
  replyText: string,
): string {
  const parsed = emailReplyDraftFrontmatterSchema.parse(frontmatter);
  assertDraftState(parsed);
  return generateMarkdownWithFrontmatter(
    emailReplyTextSchema.parse(replyText),
    parsed,
  );
}

export function parseContent(content: string): {
  frontmatter: EmailReplyDraftFrontmatter;
  replyText: string;
} {
  const parsed = parseMarkdownWithFrontmatter(content, frontmatterRecordSchema);
  const frontmatter = emailReplyDraftFrontmatterSchema.parse(
    stripVisibility(parsed.metadata),
  );
  assertDraftState(frontmatter);
  return {
    frontmatter,
    replyText: emailReplyTextSchema.parse(parsed.content.trim()),
  };
}

/**
 * Reads and writes the markdown a reply draft is stored as. The runtime
 * builds the entity's adapter from the codec on `emailReplyDraft`; the
 * drafting operator reaches for these directly.
 */
export const emailReplyDraftAdapter: {
  createContent: typeof createContent;
  parseContent: typeof parseContent;
  fromMarkdown(markdown: string): {
    content: string;
    entityType: "email-reply-draft";
    metadata: EmailReplyDraftMetadata;
  };
} = {
  createContent,
  parseContent,
  fromMarkdown(markdown) {
    const { frontmatter } = parseContent(markdown);
    return {
      content: markdown,
      entityType: "email-reply-draft",
      metadata: frontmatter,
    };
  },
};
