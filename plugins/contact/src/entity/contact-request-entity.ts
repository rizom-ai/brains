import { defineEntity, type EntityDefinition } from "@brains/sdk/entities";
import {
  storedDocumentCodec,
  writesInDocumentOrder,
} from "@brains/sdk/internal/entity-runtime";
import { contactRequestAdapter } from "./adapter";
import { contactFrontmatterSchema, contactMetadataSchema } from "./schema";

/**
 * A restricted contact request for the owner, written by the contact form:
 * never public knowledge or model input, and kept out of search,
 * embeddings and projections.
 *
 * An exception to the declared-type pattern, made deliberately, as the
 * contact-request entity class kept it: the file's header holds who wrote
 * in (name and email) and what happened since, but metadata indexes only
 * the title, when it arrived, its status and its alert's state; the name
 * and email never enter metadata. A read hands back the whole document,
 * as the class's adapter read it, and the target parses it; a write keeps
 * the header once, in the document's order (storedDocumentCodec with
 * writesInDocumentOrder).
 */
export const contactRequestEntity: EntityDefinition<
  "contact-request",
  typeof contactMetadataSchema
> = writesInDocumentOrder(
  defineEntity({
    type: "contact-request",
    purpose:
      "A restricted contact request for the owner. Never public knowledge or model input.",
    metadata: contactMetadataSchema,
    markdown: storedDocumentCodec({
      header: contactFrontmatterSchema,
      deriveMetadata: (header) => ({
        title: "Contact request" as const,
        receivedAt: header.receivedAt,
        status: header.status,
        notification: header.notification,
      }),
    }),
    config: {
      embeddable: false,
      fullTextSearchable: false,
      projectionSource: false,
      projectionSourceRole: "excluded",
    },
    validatePersist: ({ content, visibility }) => {
      if (visibility !== "restricted") {
        throw new Error("Contact requests must have restricted visibility");
      }
      contactRequestAdapter.parseContent(content);
    },
  }),
);
