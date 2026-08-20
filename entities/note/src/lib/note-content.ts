import {
  generateMarkdownWithFrontmatter,
  parseMarkdown,
} from "@brains/sdk/entities";

/**
 * A note is plain markdown the user may have written by hand, so its title
 * is not necessarily stored: frontmatter first, then the body's own H1, then
 * a placeholder. Metadata always carries one so listings have something to
 * show; the file does not have to.
 */
export function titleFromBody(body: string): string {
  return body.match(/^#\s+(.+)$/mu)?.[1]?.trim() ?? "Untitled";
}

/**
 * Whether a title has to be written down, or whether reading the note back
 * would recover it anyway.
 *
 * This is what keeps a hand-written note plain: storing a title the body
 * already states would add a frontmatter block to every note on disk.
 */
export function titleNeedsStoring(body: string, title: string): boolean {
  return titleFromBody(body) !== title;
}

/**
 * Create note content, preserving whatever structure it arrived with.
 *
 * Content with frontmatter gains a title if it lacks one and keeps every
 * other field; content without frontmatter is stored exactly as written.
 */
export function createNoteContent(title: string, content: string): string {
  const parsed = parseMarkdown(content);
  if (Object.keys(parsed.frontmatter).length === 0) return content;
  return generateMarkdownWithFrontmatter(parsed.content, {
    ...parsed.frontmatter,
    title: parsed.frontmatter["title"] ?? title,
  });
}
