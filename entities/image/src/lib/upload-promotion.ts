import { uploadTitle } from "@brains/sdk/internal/entity-runtime";
import { slugify } from "@brains/utils/string-utils";

export function isSupportedImageMediaType(mediaType: string): boolean {
  return ["image/png", "image/jpeg", "image/webp", "image/gif"].includes(
    mediaType.toLowerCase(),
  );
}

export function getUploadImageIdentity(input: {
  filename: string;
  title?: string;
}): { id: string; title: string } {
  const title = uploadTitle(input);
  const id = slugify(title);
  if (!id) {
    throw new Error(
      "Could not derive an image id from the uploaded filename. Provide a title.",
    );
  }
  return { id, title };
}
