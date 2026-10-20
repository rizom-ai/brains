/** A leading YAML frontmatter block, including the line ending that closes it. */
export const FRONTMATTER_BLOCK: RegExp =
  /^---\r?\n(?:[\s\S]*?\r?\n)?---[ \t]*(?:\r?\n|$)/;

/** Stored Markdown without its leading frontmatter block. */
export function markdownBody(content: string): string {
  return content.replace(FRONTMATTER_BLOCK, "");
}
