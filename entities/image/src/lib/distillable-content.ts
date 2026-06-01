const IMAGE_DATA_URL_PATTERN = /^data:image\/[a-z0-9.+-]+;base64,/i;

export function isImageDataUrl(value: string): boolean {
  return IMAGE_DATA_URL_PATTERN.test(value.trim());
}

export function getDistillableEntityContent(
  value: string | undefined,
): string | undefined {
  const trimmed = value?.trim();
  if (!trimmed) return undefined;
  if (isImageDataUrl(trimmed)) return undefined;
  return trimmed;
}
