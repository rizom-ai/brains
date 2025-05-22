import { z } from "zod";
import {
  baseEntitySchema,
  BaseEntity,
  EntityAdapter,
  IContentModel,
} from "@personal-brain/skeleton/src/entity/entityRegistry";

/**
 * Note schema
 */
export const noteSchema = baseEntitySchema.extend({
  entityType: z.literal("note"),
  title: z.string(),
  content: z.string(),
  format: z.enum(["markdown", "text", "html"]).default("markdown"),
  starred: z.boolean().default(false),
  metadata: z.record(z.any()).optional(),
});

/**
 * Note type
 */
export type Note = z.infer<typeof noteSchema> & IContentModel;

/**
 * Create a new note
 */
export function createNote(
  title: string,
  content: string,
  options: {
    tags?: string[];
    format?: "markdown" | "text" | "html";
    starred?: boolean;
    metadata?: Record<string, any>;
  } = {},
): Note {
  return {
    id: crypto.randomUUID(),
    created: new Date().toISOString(),
    updated: new Date().toISOString(),
    title,
    content,
    tags: options.tags || [],
    entityType: "note",
    format: options.format || "markdown",
    starred: options.starred || false,
    metadata: options.metadata,

    toMarkdown() {
      return `# ${this.title}\n\n${this.content}`;
    },
  };
}

/**
 * Note adapter
 */
export class NoteAdapter implements EntityAdapter<Note> {
  /**
   * Convert to storage format
   */
  toStorageEntity(note: Note): Record<string, any> {
    return {
      id: note.id,
      entityType: note.entityType,
      created: note.created,
      updated: note.updated,
      tags: JSON.stringify(note.tags),
      title: note.title,
      content: note.content,
      format: note.format,
      starred: note.starred,
      metadata: note.metadata ? JSON.stringify(note.metadata) : null,
    };
  }

  /**
   * Convert from storage format
   */
  fromStorageEntity(data: Record<string, any>): Note {
    return {
      id: data.id,
      entityType: "note",
      created: data.created,
      updated: data.updated,
      tags: JSON.parse(data.tags || "[]"),
      title: data.title,
      content: data.content,
      format: data.format || "markdown",
      starred: data.starred || false,
      metadata: data.metadata ? JSON.parse(data.metadata) : undefined,

      toMarkdown() {
        return `# ${this.title}\n\n${this.content}`;
      },
    };
  }

  /**
   * Convert to markdown
   */
  toMarkdown(note: Note): string {
    return note.toMarkdown();
  }

  /**
   * Get content for embedding
   * This method provides the content that should be used for generating embeddings
   */
  getEmbeddingContent(note: Note): string {
    return note.toMarkdown();
  }

  /**
   * Extract search metadata
   * This provides additional metadata for enhancing search
   */
  extractSearchMetadata(note: Note): Record<string, any> {
    return {
      title: note.title,
      starred: note.starred,
      format: note.format,
    };
  }
}
