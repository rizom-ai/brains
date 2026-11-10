import type { EntityMarkdownCodec } from "@brains/sdk/entities";
import {
  generateMarkdown,
  parseMarkdown,
} from "@brains/utils/markdown-frontmatter";
import {
  noteFrontmatterSchema,
  type NoteMetadata,
  type noteMetadataSchema,
} from "../schemas/note";

/** Reserve one character for the ellipsis; split long tokens only when necessary. */
function limitFallbackTitle(title: string | undefined): string | undefined {
  if (title === undefined) return undefined;
  const characters = Array.from(title);
  if (characters.length <= 80) return title;
  const prefix = characters.slice(0, 79).join("");
  const boundary = /\s/u.test(characters[79] ?? "")
    ? prefix
    : prefix.replace(/\s+\S*$/u, "");
  return `${boundary.trimEnd()}…`;
}

function extractH1(markdown: string): string | null {
  const h1Match = markdown.match(/^#\s+(.+)$/m);
  return h1Match?.[1]?.trim() ?? null;
}

/**
 * A note's title: the one its frontmatter states, else its body's H1, else
 * its first nonblank body line (bounded), else Untitled.
 */
export function noteTitle(stated: string | undefined, body: string): string {
  const firstLine = body.split(/\r?\n/).find((line) => line.trim());
  return (
    [
      stated?.trim(),
      extractH1(body),
      limitFallbackTitle(firstLine?.trim().replace(/^#{1,6}\s+/, "")),
    ].find((candidate) => (candidate?.length ?? 0) > 0) ?? "Untitled"
  );
}

/** The note fields a document's frontmatter states. */
function statedFields(frontmatter: Record<string, unknown>): {
  readonly title?: string | undefined;
  readonly status?: NoteMetadata["status"];
  readonly error?: string | undefined;
} {
  const parsed = noteFrontmatterSchema.safeParse(frontmatter);
  return parsed.success ? parsed.data : {};
}

/**
 * A note's frontmatter is its metadata: the title, its generation status and
 * the error a failed one recorded. A note is markdown the user may have
 * written by hand, so its title is written back only when the file states
 * it, and a note whose file states nothing is stored as its body alone.
 */
export const noteMarkdown: EntityMarkdownCodec<typeof noteMetadataSchema> = {
  decode: ({ content, frontmatter }) => {
    const stated = statedFields(frontmatter);
    return {
      content,
      metadata: {
        title: noteTitle(stated.title, content),
        ...(stated.status && { status: stated.status }),
        ...(stated.error && { error: stated.error }),
        // A blank stated title states nothing: the title is derived.
        ...(stated.title?.trim() && { titleStated: true }),
      },
    };
  },
  // The body as the note adapter wrote it: trimmed.
  encode: ({ content, metadata }) => ({
    content: content.trim(),
    frontmatter: {
      ...(metadata.titleStated === true && { title: metadata.title }),
      ...(metadata.status !== undefined && { status: metadata.status }),
      ...(metadata.error !== undefined && { error: metadata.error }),
    },
  }),
};

/**
 * Create note content, preserving existing structure: content with
 * frontmatter gains a title if it lacks one and keeps the rest; content
 * without frontmatter is stored as written. The title is stated when the
 * content has frontmatter.
 */
export function noteContent(
  title: string,
  content: string,
): {
  readonly content: string;
  readonly title: string;
  readonly titleStated: boolean;
} {
  const parsed = parseMarkdown(content);
  if (Object.keys(parsed.frontmatter).length === 0) {
    return { content, title, titleStated: false };
  }
  const stated = parsed.frontmatter["title"];
  const kept = typeof stated === "string" ? stated : title;
  return {
    content: generateMarkdown(
      { ...parsed.frontmatter, title: kept },
      parsed.content,
    ),
    title: kept,
    titleStated: true,
  };
}
