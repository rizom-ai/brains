import { BaseEntityAdapter } from "@brains/plugins";
import { z } from "@brains/utils";
import {
  noteSchema,
  noteFrontmatterSchema,
  type Note,
  type NoteFrontmatter,
  type NoteMetadata,
} from "../schemas/note";

/**
 * Entity adapter for note entities
 * Handles notes with or without frontmatter
 */
export class NoteAdapter extends BaseEntityAdapter<Note, NoteMetadata> {
  constructor() {
    super({
      entityType: "base",
      schema: noteSchema,
      frontmatterSchema: noteFrontmatterSchema,
    });
  }

  public toMarkdown(entity: Note): string {
    const body = this.extractBody(entity.content);
    try {
      const frontmatter = this.parseFrontMatter(
        entity.content,
        noteFrontmatterSchema,
      );
      if (frontmatter.title) {
        return this.buildMarkdown(body, frontmatter);
      }
    } catch {
      // No valid frontmatter
    }
    return body;
  }

  public fromMarkdown(markdown: string): Partial<Note> {
    const title = this.extractTitle(markdown) ?? "Untitled";
    return {
      content: markdown,
      entityType: "base",
      metadata: { title },
    };
  }

  /** Parse note frontmatter from entity content */
  public parseNoteFrontmatter(entity: Note): NoteFrontmatter {
    try {
      return this.parseFrontMatter(entity.content, noteFrontmatterSchema);
    } catch {
      return {};
    }
  }

  /** Create note content, preserving existing structure.
   *  If the content has frontmatter, injects title if missing.
   *  If no frontmatter, returns content as-is. */
  public createNoteContent(title: string, content: string): string {
    try {
      const existing = this.parseFrontMatter(
        content,
        z.record(z.unknown()),
      ) as Record<string, unknown>;
      // Empty record means no real frontmatter was present
      if (Object.keys(existing).length === 0) {
        return content;
      }
      // Content has frontmatter — inject title if missing, preserve the rest
      const frontmatter = { ...existing, title: existing["title"] ?? title };
      const body = this.extractBody(content);
      return this.buildMarkdown(body, frontmatter);
    } catch {
      // Parse error — save as-is
      return content;
    }
  }

  /**
   * Extract title from markdown content
   * Priority: frontmatter title > H1 heading > null
   */
  private extractTitle(markdown: string): string | null {
    try {
      const fm = this.parseFrontMatter(markdown, noteFrontmatterSchema);
      if (fm.title) return fm.title;
    } catch {
      // No valid frontmatter
    }

    const h1Match = markdown.match(/^#\s+(.+)$/m);
    if (h1Match?.[1]) return h1Match[1].trim();

    return null;
  }
}

export const noteAdapter = new NoteAdapter();
