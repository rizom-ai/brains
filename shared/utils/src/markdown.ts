import matter from "gray-matter";
import { remark } from "remark";
import { toString } from "mdast-util-to-string";
const remarkProcessor = remark();

/**
 * Parse frontmatter and content from markdown
 * Note: We spread the data object to create a shallow copy because gray-matter
 * caches parsed results and returns the same object reference for identical inputs.
 * Without this copy, mutations to frontmatter would pollute the cache.
 */
export function parseMarkdown(markdown: string): {
  frontmatter: Record<string, unknown>;
  content: string;
} {
  const { data, content } = matter(markdown);
  return {
    frontmatter: { ...data },
    content: content.trim(),
  };
}

/**
 * Generate markdown with frontmatter
 */
export function generateMarkdown(
  frontmatter: Record<string, unknown>,
  content: string,
): string {
  return matter.stringify(content, frontmatter);
}

/**
 * Strip markdown formatting from text to get plain text
 */
export function stripMarkdown(text: string): string {
  const tree = remarkProcessor.parse(text);
  return toString(tree);
}

/**
 * Update a single field in frontmatter, preserving all other fields
 */
export function updateFrontmatterField(
  markdown: string,
  field: string,
  value: unknown,
): string {
  const { frontmatter, content } = parseMarkdown(markdown);
  if (value === null || value === undefined) {
    delete frontmatter[field];
  } else {
    frontmatter[field] = value;
  }
  return generateMarkdown(frontmatter, content);
}
