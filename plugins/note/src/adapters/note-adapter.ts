import type { EntityAdapter } from "@brains/plugins";
import {
  generateMarkdownWithFrontmatter,
  parseMarkdownWithFrontmatter,
  generateFrontmatter,
} from "@brains/plugins";
import { z } from "@brains/utils";
import {
  noteSchema,
  noteFrontmatterSchema,
  type Note,
  type NoteFrontmatter,
  type NoteMetadata,
} from "../schemas/note";

/**
 * Extract title from markdown content
 * Priority: frontmatter title > H1 heading > null
 */
function extractTitleFromContent(markdown: string): string | null {
  // Try to get title from frontmatter first
  try {
    const { metadata } = parseMarkdownWithFrontmatter(
      markdown,
      noteFrontmatterSchema,
    );
    if (metadata.title) {
      return metadata.title;
    }
  } catch {
    // No valid frontmatter
  }

  // Try to extract H1 heading
  const h1Match = markdown.match(/^#\s+(.+)$/m);
  if (h1Match?.[1]) {
    return h1Match[1].trim();
  }

  return null;
}

/**
 * Entity adapter for note entities
 * Handles notes with or without frontmatter
 */
export class NoteAdapter implements EntityAdapter<Note, NoteMetadata> {
  public readonly entityType = "note" as const;
  public readonly schema = noteSchema;

  /**
   * Convert note entity to markdown
   * Preserves existing frontmatter if present
   */
  public toMarkdown(entity: Note): string {
    // Extract the body content without any existing frontmatter
    let contentBody = entity.content;
    try {
      const parsed = parseMarkdownWithFrontmatter(entity.content, z.object({}));
      contentBody = parsed.content;
    } catch {
      // Content doesn't have frontmatter, use as-is
    }

    // Try to parse existing frontmatter
    try {
      const { metadata: frontmatter } = parseMarkdownWithFrontmatter(
        entity.content,
        noteFrontmatterSchema,
      );

      // If we have frontmatter, regenerate with it
      if (frontmatter.title) {
        return generateMarkdownWithFrontmatter(contentBody, frontmatter);
      }
    } catch {
      // No valid frontmatter
    }

    // No frontmatter - return content as-is
    return contentBody;
  }

  /**
   * Parse markdown to create partial note entity
   * Extracts title from frontmatter, H1, or uses entity ID as fallback
   */
  public fromMarkdown(markdown: string): Partial<Note> {
    const title = extractTitleFromContent(markdown) ?? "Untitled";

    return {
      content: markdown,
      entityType: "note",
      metadata: {
        title,
      },
    };
  }

  /**
   * Extract metadata for search/filtering
   */
  public extractMetadata(entity: Note): NoteMetadata {
    return entity.metadata;
  }

  /**
   * Parse frontmatter from markdown
   */
  public parseFrontMatter<TFrontmatter>(
    markdown: string,
    schema: z.ZodSchema<TFrontmatter>,
  ): TFrontmatter {
    const { metadata } = parseMarkdownWithFrontmatter(markdown, schema);
    return metadata;
  }

  /**
   * Generate frontmatter for note entity
   */
  public generateFrontMatter(entity: Note): string {
    try {
      const { metadata } = parseMarkdownWithFrontmatter(
        entity.content,
        noteFrontmatterSchema,
      );
      if (metadata.title) {
        return generateFrontmatter(metadata);
      }
    } catch {
      // No valid frontmatter
    }
    return "";
  }

  /**
   * Parse note frontmatter from entity content
   */
  public parseNoteFrontmatter(entity: Note): NoteFrontmatter {
    try {
      const { metadata } = parseMarkdownWithFrontmatter(
        entity.content,
        noteFrontmatterSchema,
      );
      return metadata;
    } catch {
      return {};
    }
  }

  /**
   * Create note content with frontmatter
   */
  public createNoteContent(title: string, body: string): string {
    return generateMarkdownWithFrontmatter(body, { title });
  }
}

export const noteAdapter = new NoteAdapter();
