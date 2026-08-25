import { generateMarkdownWithFrontmatter } from "@brains/sdk/entities";

/**
 * All three memory types keep their frontmatter inside `content` as well as
 * in metadata, which is not the shape the runtime assembles for free.
 *
 * Preserved rather than corrected: these are records of what a team said,
 * decided and agreed to do, already written to disk, and re-deriving them is
 * deliberately disabled. Moving where the bytes live would be a migration of
 * live memory disguised as a boundary refactor.
 */
export const memoryMarkdown: {
  decode: (input: {
    readonly content: string;
    readonly frontmatter: Readonly<Record<string, unknown>>;
  }) => {
    readonly content: string;
    readonly metadata: Record<string, unknown>;
  };
  encode: (input: { readonly content: string }) => {
    readonly content: string;
    readonly frontmatter: Record<string, unknown>;
  };
} = {
  decode: ({ content, frontmatter }) => ({
    content: generateMarkdownWithFrontmatter(content, { ...frontmatter }),
    metadata: { ...frontmatter },
  }),
  // The frontmatter is already inside `content`, so declaring it here too
  // would write it twice.
  encode: ({ content }) => ({ content, frontmatter: {} }),
};

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
