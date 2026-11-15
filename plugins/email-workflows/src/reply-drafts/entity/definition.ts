import { defineEntity, type EntityDefinition } from "@brains/sdk/entities";
import { generateMarkdownWithFrontmatter } from "@brains/sdk/internal/entity-runtime";
import { emailReplyDraftAdapter } from "./adapter";
import {
  emailReplyDraftFrontmatterSchema,
  type emailReplyDraftSchema,
} from "./schema";
import type { z } from "@brains/utils/zod";

type DraftMetadataSchema = z.ZodObject<
  Pick<
    typeof emailReplyDraftFrontmatterSchema.shape,
    "mailItemId" | "revision" | "status" | "sentAt" | "providerDeliveryId"
  >
>;

/**
 * An operator-editable reply authored by the brain, without a copy of the
 * source email: its frontmatter its metadata, coherent about whether it was
 * sent. Not installed in any brain on main; declared here so the drafting
 * flow that installs it finds the type its class defined. A read hands
 * back the whole document, as the class's adapter read it, since the
 * drafting operator parses it.
 */
export const emailReplyDraftEntity: EntityDefinition<
  "email-reply-draft",
  DraftMetadataSchema
> = defineEntity({
  type: "email-reply-draft",
  purpose:
    "An operator-editable reply authored by Brain without a copy of the source email.",
  metadata: emailReplyDraftFrontmatterSchema,
  config: {
    projectionSource: false,
    projectionSourceRole: "excluded",
    // updatedAt repeated the entity's own update time.
    retiredFields: ["updatedAt"],
  },
  markdown: {
    decode: ({ content, frontmatter }) => {
      const { visibility: _visibility, ...header } = frontmatter;
      const parsed = emailReplyDraftFrontmatterSchema.parse(header);
      const document = generateMarkdownWithFrontmatter(content, parsed);
      // Coherent about whether it was sent, as the class's adapter required.
      emailReplyDraftAdapter.parseContent(document);
      return { content: document, metadata: parsed };
    },
    encode: ({ content, metadata }) => ({
      content: content.trim(),
      frontmatter: { ...metadata },
    }),
  },
  // Restricted, always, and a reply the drafting operator can read.
  validatePersist: ({ content, visibility }) => {
    if (visibility !== "restricted") {
      throw new Error("Email reply drafts must have restricted visibility");
    }
    emailReplyDraftAdapter.parseContent(content);
  },
});

export type { emailReplyDraftSchema };
