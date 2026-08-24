import type { CreateResultAttachment } from "@brains/sdk/entities";

/**
 * A link to an image, handed back before it has been generated or rendered.
 *
 * The id is allocated up front, so the URL is already known — which is also
 * why the id must be the one the entity is stored under.
 */
export function imageLink(input: {
  entityId: string;
  attachmentType: string;
  mediaType?: string | undefined;
  filename?: string | undefined;
}): CreateResultAttachment {
  const encodedId = encodeURIComponent(input.entityId);
  return {
    mediaType: input.mediaType ?? "image/png",
    url: `/api/chat/attachments/image?id=${encodedId}`,
    downloadUrl: `/api/chat/attachments/image?id=${encodedId}&download=1`,
    filename: input.filename ?? `${input.entityId}.png`,
    source: {
      entityType: "image",
      entityId: input.entityId,
      attachmentType: input.attachmentType,
    },
  };
}

/**
 * Which frontmatter field a target holds this image in.
 *
 * A cover image and a social preview are distinct concepts with distinct
 * fields, and the attachment type is what says which — an `og-image` is the
 * OG image, anything else attached to a target is its cover.
 */
export function imageFieldFor(attachmentType: string | undefined): string {
  return attachmentType === "og-image" ? "ogImageId" : "coverImageId";
}
