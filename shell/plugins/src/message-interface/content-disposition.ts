export type ContentDispositionType = "inline" | "attachment";

export interface ContentDispositionInput {
  disposition: ContentDispositionType;
  filename: string;
}

/**
 * Format a safe Content-Disposition header value for downloaded/inline files.
 *
 * Includes an ASCII-only fallback `filename` parameter for older clients and an
 * RFC 5987 `filename*` parameter that preserves the original UTF-8 filename.
 */
export function formatContentDispositionHeader({
  disposition,
  filename,
}: ContentDispositionInput): string {
  return `${disposition}; filename="${formatAsciiFilenameFallback(
    filename,
  )}"; filename*=UTF-8''${encodeContentDispositionFilename(filename)}`;
}

function formatAsciiFilenameFallback(filename: string): string {
  return filename.replace(/[^\x20-\x7E]|["\\\r\n]/g, "_");
}

function encodeContentDispositionFilename(filename: string): string {
  return encodeURIComponent(filename).replace(
    /[!'()*]/g,
    (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`,
  );
}
