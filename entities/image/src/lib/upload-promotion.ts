import { slugify } from "@brains/utils/string-utils";

export const webChatUploadsScope = {
  namespace: "upload",
  refKind: "upload",
  routePath: "/api/chat/uploads",
} as const;

export function isSupportedImageMediaType(mediaType: string): boolean {
  return ["image/png", "image/jpeg", "image/webp", "image/gif"].includes(
    mediaType.toLowerCase(),
  );
}

export function getUploadImageIdentity(input: {
  filename: string;
  title?: string;
}): { id: string; title: string } {
  const title = getUploadTitle(input.title, input.filename);
  const id = slugify(title);
  if (!id) {
    throw new Error(
      "Could not derive an image id from the uploaded filename. Provide a title.",
    );
  }
  return { id, title };
}

function getUploadTitle(title: string | undefined, filename: string): string {
  const trimmed = title?.trim();
  if (trimmed) return trimmed;
  const withoutExt = filename.replace(/\.[^.]+$/, "").trim();
  return withoutExt || filename;
}
