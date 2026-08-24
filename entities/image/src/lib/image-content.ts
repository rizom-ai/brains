const IMAGE_DATA_URL = /^data:image\/[a-z0-9.+-]+;base64,/i;

export function isImageDataUrl(value: string): boolean {
  return IMAGE_DATA_URL.test(value.trim());
}

/**
 * Content worth distilling a visual concept from.
 *
 * An image data URL is content in the create sense but says nothing about
 * what to depict, so it is not material for a prompt.
 */
export function distillable(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  if (!trimmed || isImageDataUrl(trimmed)) return undefined;
  return trimmed;
}

const SUPPORTED_UPLOAD_MEDIA_TYPES = [
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
];

export function isSupportedImageMediaType(mediaType: string): boolean {
  return SUPPORTED_UPLOAD_MEDIA_TYPES.includes(mediaType.toLowerCase());
}
