import {
  defineEntity,
  generateMarkdownWithFrontmatter,
  parseMarkdownWithFrontmatter,
  z,
  type EntityDefinition,
} from "@brains/sdk/entities";
import type { ServiceEntityExtension } from "@brains/sdk/services";
import {
  mailItemMetadataFromFrontmatter,
  parseMailItemContent,
  stripVisibility,
} from "./entity/adapters/mail-item-adapter";
import {
  mailItemFrontmatterSchema,
  mailItemMetadataSchema,
} from "./entity/schemas/mail-item";

const frontmatterRecordSchema = z.record(z.string(), z.unknown());

/**
 * A restricted, derived routing summary for an inbound email.
 *
 * The original stays in the mailbox; the item carries what an operator needs
 * to route it and nothing that could reproduce the message. Excluded from
 * projections for the same reason: a mail item is bookkeeping about mail,
 * not knowledge of the brain's own.
 *
 * The file keeps the full header — source locator, sender label, requested
 * actions — and metadata indexes the queryable part of it. Thread position
 * lives under `source` in the file and at the top level of metadata, which
 * is why the codec is spelled out rather than taken from the shared helper.
 */
export const mailItem: EntityDefinition<
  "mail-item",
  typeof mailItemMetadataSchema
> = defineEntity({
  type: "mail-item",
  purpose:
    "A restricted, derived routing summary for an inbound email whose original remains in the mailbox.",
  metadata: mailItemMetadataSchema,
  config: { projectionSource: false, projectionSourceRole: "excluded" },
  markdown: {
    decode: ({ content, frontmatter }) => {
      const parsed = mailItemFrontmatterSchema.parse(
        stripVisibility(frontmatter),
      );
      return {
        content: generateMarkdownWithFrontmatter(content, parsed),
        metadata: mailItemMetadataFromFrontmatter(parsed),
      };
    },
    encode: ({ content, metadata }) => {
      const stored = parseMarkdownWithFrontmatter(
        content,
        frontmatterRecordSchema,
      );
      const source = mailItemFrontmatterSchema.shape.source.parse(
        stored.metadata["source"],
      );
      return {
        content: generateMarkdownWithFrontmatter(stored.content, {
          ...stripVisibility(stored.metadata),
          title: metadata.title,
          category: metadata.category,
          priority: metadata.priority,
          status: metadata.status,
          needsReply: metadata.needsReply,
          receivedAt: metadata.receivedAt,
          source: {
            ...source,
            ...(metadata.threadKey ? { threadKey: metadata.threadKey } : {}),
            ...(metadata.threadOrdinal !== undefined
              ? { threadOrdinal: metadata.threadOrdinal }
              : {}),
          },
        }),
        frontmatter: {},
      };
    },
  },
});

/**
 * What may be persisted as a mail item. Restricted, always; and only the
 * system fallback may carry no category, so a classification the model
 * failed to make cannot be smuggled in as one it did.
 */
export const mailItemExtension: ServiceEntityExtension = {
  entityType: "mail-item",
  validate: async (entity) => {
    if (entity.visibility !== "restricted") {
      throw new Error("Mail items must have restricted visibility");
    }
    const { frontmatter } = parseMailItemContent(entity.content);
    if (
      frontmatter.category === null &&
      (frontmatter.title !== "Unclassified email" ||
        frontmatter.priority !== "high")
    ) {
      throw new Error(
        "Only the system fallback may have an unclassified category",
      );
    }
  },
};
