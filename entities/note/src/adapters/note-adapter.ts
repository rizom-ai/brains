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
      entityType: "note",
      purpose:
        "A short, free-form captured thought, reference, or snippet the user wants to keep.",
      schema: noteSchema,
      frontmatterSchema: noteFrontmatterSchema,
    });
  }

  public override toMarkdown(entity: Note): string {
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
    const frontmatter = this.parseMarkdownFrontmatter(markdown);
    const title = frontmatter.title ?? this.extractH1(markdown) ?? "Untitled";
    return {
      content: markdown,
      entityType: "note",
      metadata: {
        title,
        ...(frontmatter.status && { status: frontmatter.status }),
        ...(frontmatter.error && { error: frontmatter.error }),
      },
    };
  }

  /** Parse note frontmatter from entity content */
  public parseNoteFrontmatter(entity: Note): NoteFrontmatter {
    return this.parseMarkdownFrontmatter(entity.content);
  }

  private parseMarkdownFrontmatter(markdown: string): NoteFrontmatter {
    try {
      return this.parseFrontMatter(markdown, noteFrontmatterSchema);
    } catch {
      return {};
    }
  }

  public buildStub(input: { id: string; title: string }): {
    content: string;
    metadata: NoteMetadata;
  } {
    const frontmatter: NoteFrontmatter = {
      title: input.title,
      status: "generating",
    };
    return {
      content: this.buildMarkdown("", frontmatter),
      metadata: {
        title: input.title,
        status: "generating",
      },
    };
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

  private extractH1(markdown: string): string | null {
    const h1Match = markdown.match(/^#\s+(.+)$/m);
    return h1Match?.[1]?.trim() ?? null;
  }
}

export const noteAdapter = new NoteAdapter();
