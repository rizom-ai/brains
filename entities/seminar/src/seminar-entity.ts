import { defineEntity, type EntityDefinition } from "@brains/sdk/entities";
import { readSeminarBody, seminarBody } from "./lib/seminar-body";
import {
  seminarFrontmatterSchema,
  seminarMetadataSchema,
} from "./schemas/seminar";

/**
 * A seminar: one question put to the brain's approved peers, and what each
 * said, verbatim. Its header is its metadata and its body its turns. Its job
 * writes it and nobody edits it, so what a peer's turn says is what that
 * peer's brain answered; the owner reads it and publishes it.
 */
export const seminar: EntityDefinition<
  "seminar",
  typeof seminarMetadataSchema
> = defineEntity({
  type: "seminar",
  purpose:
    "One question put to the brain's approved peers and kept as their exchange: each peer's answer verbatim, with the sources it returned.",
  classification: "content",
  metadata: seminarMetadataSchema,
  markdown: {
    decode: ({ content, frontmatter }) => ({
      content: content.replace(/^\n+/u, ""),
      metadata: seminarFrontmatterSchema.parse(frontmatter),
    }),
    // A write is validated like a read: the body through its codec.
    encode: ({ content, metadata }) => ({
      content: seminarBody(readSeminarBody(content.replace(/^\n+/u, ""))),
      frontmatter: seminarFrontmatterSchema.parse(metadata),
    }),
  },
  config: {
    includeInBroadSearch: true,
    actionPolicy: { create: "never", update: "never", publish: "admin" },
    publish: { publishStatuses: ["published"] },
  },
});
