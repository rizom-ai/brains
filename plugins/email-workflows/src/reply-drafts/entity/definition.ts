import {
  defineEntity,
  frontmatterInContent,
  type EntityDefinition,
} from "@brains/sdk/entities";
import type { ServiceEntityExtension } from "@brains/sdk/services";
import { stripVisibility } from "../../entity/adapters/mail-item-adapter";
import { assertDraftState, emailReplyDraftAdapter } from "./adapter";
import {
  emailReplyDraftFrontmatterSchema,
  emailReplyDraftMetadataSchema,
} from "./schema";

/**
 * An operator-editable reply authored by the brain, without a copy of the
 * source email. Not yet declared by the email-workflows service: the
 * drafting flow that would register it is still landing, so the type is
 * defined here for that work to declare, and stays out of every brain
 * until it does.
 */
export const emailReplyDraft: EntityDefinition<
  "email-reply-draft",
  typeof emailReplyDraftMetadataSchema
> = defineEntity({
  type: "email-reply-draft",
  purpose:
    "An operator-editable reply authored by Brain without a copy of the source email.",
  metadata: emailReplyDraftMetadataSchema,
  config: { projectionSource: false, projectionSourceRole: "excluded" },
  markdown: frontmatterInContent((frontmatter) => {
    const parsed = emailReplyDraftFrontmatterSchema.parse(
      stripVisibility(frontmatter),
    );
    assertDraftState(parsed);
    return emailReplyDraftMetadataSchema.parse(parsed);
  }),
});

/** Restricted, always; and coherent about whether it has been sent. */
export const emailReplyDraftExtension: ServiceEntityExtension = {
  entityType: "email-reply-draft",
  validate: async (entity) => {
    if (entity.visibility !== "restricted") {
      throw new Error("Email reply drafts must have restricted visibility");
    }
    emailReplyDraftAdapter.parseContent(entity.content);
  },
};
