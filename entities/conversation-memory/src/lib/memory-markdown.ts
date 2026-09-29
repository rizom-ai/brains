import {
  frontmatterInContent,
  generateMarkdownWithFrontmatter,
} from "@brains/sdk/entities";

/**
 * All three memory types keep their frontmatter inside `content` as well as
 * in metadata, which is not the shape the runtime assembles for free.
 *
 * Preserved rather than corrected: these are records of what a team said,
 * decided and agreed to do, already written to disk, and re-deriving them is
 * deliberately disabled. Moving where the bytes live would be a migration of
 * live memory disguised as a boundary refactor.
 */
export const memoryMarkdown: ReturnType<
  typeof frontmatterInContent<Record<string, unknown>>
> = frontmatterInContent((frontmatter) => ({ ...frontmatter }));

/**
 * A decision or action item's body: a title and the text under it.
 *
 * Deliberately plainer than a summary's — these are one statement each, and
 * the shape a reader wants is the statement.
 */
export function composeMemoryBody(title: string, text: string): string {
  return [`# ${title}`, "", text.trim(), ""].join("\n");
}

/**
 * A memory entity's stored content: the body with its frontmatter baked in,
 * which is the shape these three have always been written in.
 */
export function composeMemoryMarkdown(
  body: string,
  metadata: Record<string, unknown>,
): string {
  return generateMarkdownWithFrontmatter(body, metadata);
}
