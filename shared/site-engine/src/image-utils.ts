/** Image entity shape for getEntity calls */
export interface ImageEntity {
  id: string;
  entityType: string;
  content: string;
  metadata: {
    format?: string;
    width?: number;
    height?: number;
  };
  created: string;
  updated: string;
  contentHash: string;
}

/** Detect image format from metadata or data URL, defaulting to "png" */
export function detectImageFormat(
  metadata: { format?: string },
  dataUrl: string,
): string {
  if (metadata.format) return metadata.format;
  const match = dataUrl.match(/^data:image\/([^;]+);/);
  return match?.[1] ?? "png";
}

/** Extract base64 data from a data URL, or null if not a valid data URL */
export function extractBase64(dataUrl: string): string | null {
  const match = dataUrl.match(/^data:image\/[^;]+;base64,(.+)$/);
  return match?.[1] ?? null;
}

/** Escape a string for safe use in an HTML attribute */
export function escapeHtmlAttr(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
