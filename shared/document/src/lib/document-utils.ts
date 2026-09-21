/**
 * Count pages in a PDF buffer by reading the page tree.
 *
 * Prefers `/Type /Pages ... /Count N` (works for compressed and uncompressed
 * page trees); falls back to counting `/Type /Page` leaf nodes if the parent
 * Count entry is not directly readable. Returns 0 if neither is found, so
 * callers should treat 0 as "unknown" rather than "empty".
 */
export function countPdfPages(data: Buffer | Uint8Array): number {
  const text = Buffer.from(data).toString("latin1");

  let max = 0;
  const countRegex =
    /\/Type\s*\/Pages\b[^]*?\/Count\s+(\d+)|\/Count\s+(\d+)[^]*?\/Type\s*\/Pages\b/g;
  for (const match of text.matchAll(countRegex)) {
    const value = parseInt(match[1] ?? match[2] ?? "0", 10);
    if (value > max) max = value;
  }
  if (max > 0) return max;

  const leafMatches = text.match(/\/Type\s*\/Page(?!\w)/g);
  return leafMatches?.length ?? 0;
}
