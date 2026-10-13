import type { ContentEdit } from "./schemas";

/** Match every edit against the original before changing any text. */
export function applyContentEdits(
  content: string,
  edits: ContentEdit[],
): string {
  const matches = edits
    .map(({ oldText, newText }, index) => {
      const start = content.indexOf(oldText);
      if (!oldText || start < 0) {
        throw new Error(
          `Edit ${index + 1}: oldText was not found. Fetch the entity again and provide exact text.`,
        );
      }
      if (content.indexOf(oldText, start + 1) !== -1) {
        throw new Error(
          `Edit ${index + 1}: oldText is ambiguous. Include more surrounding text to match exactly once.`,
        );
      }
      return { start, end: start + oldText.length, newText };
    })
    .sort((left, right) => left.start - right.start);

  let end = 0;
  const parts: string[] = [];
  for (const match of matches) {
    if (match.start < end)
      throw new Error(
        "Edits overlap in the original content. Provide non-overlapping replacements.",
      );
    parts.push(content.slice(end, match.start), match.newText);
    end = match.end;
  }
  parts.push(content.slice(end));
  return parts.join("");
}
