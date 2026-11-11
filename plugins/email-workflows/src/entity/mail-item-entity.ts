import { defineEntity, type EntityDefinition } from "@brains/sdk/entities";
import {
  storedDocumentCodec,
  writesInDocumentOrder,
} from "@brains/sdk/internal/entity-runtime";
import { mailItemAdapter } from "./adapters/mail-item-adapter";
import {
  mailItemFrontmatterSchema,
  mailItemMetadataSchema,
} from "./schemas/mail-item";

/** Written by earlier releases and never read. */
const MAIL_ITEM_RETIRED_FIELDS = ["source.senderKey", "source.domain"];

/**
 * A restricted, derived routing summary for an inbound email whose original
 * remains in the mailbox, kept out of projections: bookkeeping about mail,
 * not knowledge of the brain's own.
 *
 * An exception to the declared-type pattern, made deliberately, as the
 * mail-item entity class kept it: the file carries the full header, but
 * metadata indexes only its routing fields and the thread position under
 * `source`. The source locator, the sender label, the organization and the
 * requested actions never enter metadata, so no email address or sender
 * detail is indexed, searched or embedded. A read hands back the whole
 * document, header and summary, as the class's adapter read it, and the
 * readers that parse it (the operator, the thread ordinals, the Inbox)
 * read it unchanged. Writing, the type states its indexed fields and the
 * serializer keeps the rest of the header the document carries, once, in
 * the order the document gives it: the header is never written twice, and
 * its visibility closes it, as the class wrote it (storedDocumentCodec with
 * writesInDocumentOrder).
 */
export const mailItemEntity: EntityDefinition<
  "mail-item",
  typeof mailItemMetadataSchema
> = writesInDocumentOrder(
  defineEntity({
    type: "mail-item",
    purpose:
      "A restricted, derived routing summary for an inbound email whose original remains in the mailbox.",
    metadata: mailItemMetadataSchema,
    config: {
      projectionSource: false,
      projectionSourceRole: "excluded",
      retiredFields: MAIL_ITEM_RETIRED_FIELDS,
    },
    // The header's routing fields and thread position, and nothing else.
    markdown: storedDocumentCodec({
      header: mailItemFrontmatterSchema,
      deriveMetadata: (header) => ({
        title: header.title,
        category: header.category,
        priority: header.priority,
        status: header.status,
        needsReply: header.needsReply,
        receivedAt: header.receivedAt,
        ...(header.source.threadKey
          ? { threadKey: header.source.threadKey }
          : {}),
        ...(header.source.threadOrdinal !== undefined
          ? { threadOrdinal: header.source.threadOrdinal }
          : {}),
      }),
    }),
    // Restricted, always; and only the system fallback may carry no
    // category, so a classification the model failed to make cannot pass
    // for one it did.
    validatePersist: ({ content, visibility }) => {
      if (visibility !== "restricted") {
        throw new Error("Mail items must have restricted visibility");
      }
      const { frontmatter } = mailItemAdapter.parseMailItemContent(content);
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
  }),
);
