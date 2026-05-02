import type { RawEntity } from "../types";

export type ImportContentSkipReason = "empty-content" | "empty-frontmatter";

export function getImportContentSkipReason(
  rawEntity: RawEntity,
): ImportContentSkipReason | undefined {
  // Skip files with empty or near-empty content — this happens when a file
  // is read mid-write during a git pull (transient state, not invalid data)
  if (!rawEntity.content || rawEntity.content.trim().length === 0) {
    return "empty-content";
  }

  // Skip files where frontmatter is just delimiters with no actual fields
  const trimmed = rawEntity.content.trim();
  if (trimmed === "---" || trimmed === "---\n---" || trimmed === "---\r\n---") {
    return "empty-frontmatter";
  }

  return undefined;
}

export function getImportContentSkipMessage(
  reason: ImportContentSkipReason,
): string {
  switch (reason) {
    case "empty-content":
      return "Skipping file with empty content (likely mid-write)";
    case "empty-frontmatter":
      return "Skipping file with empty frontmatter (likely mid-write)";
  }
}
