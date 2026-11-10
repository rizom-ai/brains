import type { EntityCreateAttachment } from "@brains/sdk/entities";

type CreateResultAttachment = ReturnType<EntityCreateAttachment>;

/** The link a create answers for an image a job is still filling. */
export function buildPredictedImageAttachment(
  imageId: string,
  attachmentType = "generated",
): CreateResultAttachment {
  const encodedId = encodeURIComponent(imageId);
  return {
    mediaType: "image/png",
    url: `/api/chat/attachments/image?id=${encodedId}`,
    downloadUrl: `/api/chat/attachments/image?id=${encodedId}&download=1`,
    filename: `${imageId}.png`,
    source: {
      entityType: "image",
      entityId: imageId,
      attachmentType,
    },
  };
}

/** The link a create answers for an uploaded image being promoted. */
export function buildUploadedImageAttachment(input: {
  mediaType: string;
  entityId: string;
  filename: string;
}): CreateResultAttachment {
  const encodedId = encodeURIComponent(input.entityId);
  return {
    mediaType: input.mediaType,
    url: `/api/chat/attachments/image?id=${encodedId}`,
    downloadUrl: `/api/chat/attachments/image?id=${encodedId}&download=1`,
    filename: input.filename,
    source: {
      entityType: "image",
      entityId: input.entityId,
      attachmentType: "uploaded",
    },
  };
}
