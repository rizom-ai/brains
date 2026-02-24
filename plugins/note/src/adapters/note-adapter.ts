import { BaseEntityAdapter } from "@brains/plugins";
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

  /** Create note content with frontmatter */
  public createNoteContent(title: string, body: string): string {
    return this.buildMarkdown(body, { title });
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
