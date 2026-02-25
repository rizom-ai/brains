import type { EntityAdapter } from "@brains/plugins";
import { Note } from "./noteEntity";
import matter from "gray-matter";

/**
 * Adapter for Note entities
 * Handles conversion between markdown and Note objects
 */
export class NoteAdapter implements EntityAdapter<Note> {
  /**
   * Convert from markdown to Note entity
   */
  fromMarkdown(markdown: string, metadata?: Record<string, any>): Note {
    // Parse frontmatter
    const { data, content } = matter(markdown);

    // Extract title from first heading or frontmatter
    let title = data.title;
    if (!title) {
      // Look for markdown heading
      const match = content.match(/^#\s+(.+)$/m);
      if (match) {
        title = match[1].trim();
      } else {
        // Default title
        title = "Untitled Note";
      }
    }

    // Create note object
    return {
      id: data.id || crypto.randomUUID(),
      created: data.created || new Date().toISOString(),
      updated: data.updated || new Date().toISOString(),
      tags: data.tags || [],
      entityType: "base",
      title,
      content: content.trim(),
      format: data.format || "markdown",
      starred: data.starred || false,
      metadata: data.metadata || {},

      toMarkdown() {
        return this.content;
      },
    };
  }

  /**
   * Extract metadata from markdown frontmatter
   */
  parseFrontMatter(markdown: string): Record<string, any> {
    const { data } = matter(markdown);
    return data;
  }

  /**
   * Generate frontmatter for markdown
   */
  generateFrontMatter(note: Note): string {
    const frontMatterData = {
      id: note.id,
      title: note.title,
      created: note.created,
      updated: note.updated,
      tags: note.tags,
      entityType: note.entityType,
      format: note.format,
      starred: note.starred,
      metadata: note.metadata,
    };

    // Generate YAML frontmatter
    return matter.stringify("", frontMatterData).trim();
  }

  /**
   * Extract metadata for search/filtering
   */
  extractMetadata(note: Note): Record<string, any> {
    return {
      title: note.title,
      starred: note.starred,
      format: note.format,
      contentLength: note.content.length,
      hasCode: note.content.includes("```"),
    };
  }
}
