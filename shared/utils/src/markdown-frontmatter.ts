import matter from "gray-matter";

/** Frontmatter-only operations must not initialize the Markdown AST pipeline.
 * This module is also used by headless contracts and browser clients.
 */
export function parseMarkdown(markdown: string): {
  frontmatter: Record<string, unknown>;
  content: string;
} {
  const { data, content } = matter(markdown);
  // gray-matter caches its parsed object; never expose that mutable cache.
  return { frontmatter: { ...data }, content: content.trim() };
}

export function generateMarkdown(
  frontmatter: Record<string, unknown>,
  content: string,
): string {
  return matter.stringify(content, frontmatter);
}

/** Update a single field while preserving all other frontmatter fields. */
export function updateFrontmatterField(
  markdown: string,
  field: string,
  value: unknown,
): string {
  const { frontmatter, content } = parseMarkdown(markdown);
  if (value === null || value === undefined) delete frontmatter[field];
  else frontmatter[field] = value;
  return generateMarkdown(frontmatter, content);
}
