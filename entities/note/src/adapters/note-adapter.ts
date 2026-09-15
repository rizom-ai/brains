import { BaseEntityAdapter } from "@brains/plugins";
import { z } from "@brains/utils/zod";
import {
  noteSchema,
  noteFrontmatterSchema,
  type Note,
  type NoteFrontmatter,
  type NoteMetadata,
} from "../schemas/note";

const frontmatterRecordSchema: z.ZodRecord<z.ZodString, z.ZodUnknown> =
  z.record(z.string(), z.unknown());

/**
 * Entity adapter for note entities
 * Handles notes with or without frontmatter
 */
export class NoteAdapter extends BaseEntityAdapter<
  Note,
  NoteMetadata,
  NoteFrontmatter
> {
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
      if (Object.values(frontmatter).some((value) => value !== undefined)) {
        return this.buildMarkdown(body, frontmatter);
      }
    } catch {
      // No valid frontmatter
    }
    return body;
  }

  public fromMarkdown(markdown: string): Partial<Note> {
    const frontmatter = this.parseMarkdownFrontmatter(markdown);
    const body = this.extractBody(markdown);
    const firstLine = body.split(/\r?\n/).find((line) => line.trim());
    const title =
      [
        frontmatter.title?.trim(),
        this.extractH1(body),
        this.limitFallbackTitle(firstLine?.trim().replace(/^#{1,6}\s+/, "")),
      ].find((candidate) => (candidate?.length ?? 0) > 0) ?? "Untitled";
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

  /** Resolve missing/default labels for stored notes without changing their source. */
  public override extractMetadata(entity: Note): NoteMetadata {
    if (entity.metadata.title.trim() && entity.metadata.title !== "Untitled") {
      return entity.metadata;
    }
    return {
      ...entity.metadata,
      title: this.fromMarkdown(entity.content).metadata?.title ?? "Untitled",
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
      const existing = this.parseFrontMatter(content, frontmatterRecordSchema);
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

  /** Reserve one character for the ellipsis; split long tokens only when necessary. */
  private limitFallbackTitle(title: string | undefined): string | undefined {
    if (title === undefined) return undefined;
    const characters = Array.from(title);
    if (characters.length <= 80) return title;
    const prefix = characters.slice(0, 79).join("");
    const boundary = /\s/u.test(characters[79] ?? "")
      ? prefix
      : prefix.replace(/\s+\S*$/u, "");
    return `${boundary.trimEnd()}…`;
  }

  private extractH1(markdown: string): string | null {
    const h1Match = markdown.match(/^#\s+(.+)$/m);
    return h1Match?.[1]?.trim() ?? null;
  }
}

export const noteAdapter: NoteAdapter = new NoteAdapter();
