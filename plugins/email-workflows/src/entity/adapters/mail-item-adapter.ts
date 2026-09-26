import {
  generateMarkdownWithFrontmatter,
  parseMarkdownWithFrontmatter,
  z,
} from "@brains/sdk/entities";
import {
  mailItemFrontmatterSchema,
  type MailItemFrontmatter,
  type MailItemMetadata,
} from "../schemas/mail-item";

const mailItemSummarySchema = z.string().min(1).max(1_000);
const frontmatterRecordSchema = z.record(z.string(), z.unknown());

/**
 * The frontmatter a file carries, minus the visibility the runtime writes
 * into exported markdown. Visibility is the entity's, not the document's,
 * and the strict frontmatter schema would otherwise refuse its own export.
 */
export function stripVisibility(
  frontmatter: Readonly<Record<string, unknown>>,
): Record<string, unknown> {
  const { visibility: _visibility, ...rest } = frontmatter;
  return rest;
}

/** The indexed fields, taken from the frontmatter the file keeps in full. */
export function mailItemMetadataFromFrontmatter(
  frontmatter: MailItemFrontmatter,
): MailItemMetadata {
  return {
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
  };
}

export function createMailItemContent(
  frontmatter: MailItemFrontmatter,
  summary: string,
): string {
  return generateMarkdownWithFrontmatter(
    mailItemSummarySchema.parse(summary),
    mailItemFrontmatterSchema.parse(frontmatter),
  );
}

export function parseMailItemContent(content: string): {
  frontmatter: MailItemFrontmatter;
  summary: string;
} {
  const parsed = parseMarkdownWithFrontmatter(content, frontmatterRecordSchema);
  return {
    frontmatter: mailItemFrontmatterSchema.parse(
      stripVisibility(parsed.metadata),
    ),
    summary: mailItemSummarySchema.parse(parsed.content.trim()),
  };
}

/**
 * Reads and writes the markdown a mail item is stored as.
 *
 * The runtime builds the entity's adapter from the codec on `mailItem`; what
 * is left here is what the triage, operator and coordinator code reach for
 * directly — the file as a derived summary under a strict header.
 */
export const mailItemAdapter: {
  createMailItemContent: typeof createMailItemContent;
  parseMailItemContent: typeof parseMailItemContent;
  fromMarkdown(markdown: string): {
    content: string;
    entityType: "mail-item";
    metadata: MailItemMetadata;
  };
} = {
  createMailItemContent,
  parseMailItemContent,
  fromMarkdown(markdown) {
    const { frontmatter } = parseMailItemContent(markdown);
    return {
      content: markdown,
      entityType: "mail-item",
      metadata: mailItemMetadataFromFrontmatter(frontmatter),
    };
  },
};
