import type { CreateResultAttachment } from "@brains/sdk/entities";

/**
 * A link to a document, for a caller who asked for one.
 *
 * Handed back before the render finishes on the attachment-derived path: the
 * id is allocated up front, so the URL is already known. Which is also why
 * the id has to be the one the entity is stored under.
 */
export function documentLink(input: {
  entityId: string;
  filename: string;
  attachmentType: string;
}): CreateResultAttachment {
  const encodedId = encodeURIComponent(input.entityId);
  return {
    mediaType: "application/pdf",
    url: `/api/chat/attachments/document?id=${encodedId}`,
    downloadUrl: `/api/chat/attachments/document?id=${encodedId}&download=1`,
    filename: input.filename,
    source: {
      entityType: "document",
      entityId: input.entityId,
      attachmentType: input.attachmentType,
    },
  };
}
