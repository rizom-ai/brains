export interface ParsedBase64DataUrl {
  mimeType: string;
  data: Buffer<ArrayBuffer>;
}

/** The media type and bytes of a base64 data URL, or nothing when it is not one. */
export function parseBase64DataUrl(
  content: string,
): ParsedBase64DataUrl | undefined {
  // A data URL read from a markdown file keeps that file's newline.
  const match = /^data:([^;,]+);base64,(.+)$/i.exec(content.trim());
  if (!match?.[1] || !match[2]) return undefined;
  return { mimeType: match[1], data: Buffer.from(match[2], "base64") };
}
