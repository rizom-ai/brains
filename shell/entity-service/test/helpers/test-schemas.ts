import { z } from "@brains/utils";
import type { EntityAdapter, BaseEntity } from "../../src/types";
import { baseEntitySchema } from "../../src/types";

// -- Note entity (used in: immediate-persistence, deduplicate-id, embeddable-config) --

export const noteSchema = baseEntitySchema.extend({
  entityType: z.literal("note"),
  title: z.string(),
  tags: z.array(z.string()),
});

export type Note = z.infer<typeof noteSchema>;

export type NoteInput = Omit<
  Note,
  "id" | "created" | "updated" | "contentHash"
> & {
  id?: string;
  created?: string;
  updated?: string;
};

export function createNoteInput(
  data: { title: string; content: string; tags: string[] },
  id?: string,
): NoteInput {
  return {
    ...(id && { id }),
    entityType: "note" as const,
    title: data.title,
    content: data.content,
    tags: data.tags,
    metadata: {},
  };
}

export const noteAdapter: EntityAdapter<Note> = {
  entityType: "note",
  schema: noteSchema,
  toMarkdown: (entity: Note): string =>
    `---\ntitle: ${entity.title}\ntags: ${JSON.stringify(entity.tags)}\n---\n\n${entity.content}`,
  fromMarkdown: (markdown: string): Partial<Note> => {
    const titleMatch = markdown.match(/title:\s*(.+)/);
    const title = titleMatch?.[1] ?? "Untitled";
    const bodyMatch = markdown.match(/---\n\n(.+)/s);
    const content = bodyMatch?.[1] ?? markdown;
    return { title, content, tags: [] };
  },
  extractMetadata: (entity: Note): Record<string, unknown> => ({
    title: entity.title,
    tags: entity.tags,
  }),
  parseFrontMatter: <TFrontmatter>(
    _markdown: string,
    schema: z.ZodSchema<TFrontmatter>,
  ): TFrontmatter => schema.parse({}),
  generateFrontMatter: (entity: Note): string => {
    return `---\ntitle: ${entity.title}\ntags: ${JSON.stringify(entity.tags)}\n---\n`;
  },
};

// -- Post entity (used in: count-entities, sort-fields) --

export const postSchema = baseEntitySchema.extend({
  entityType: z.literal("post"),
  metadata: z.object({
    publishedAt: z.string().optional(),
    status: z.string().optional(),
    category: z.string().optional(),
  }),
});

export type Post = z.infer<typeof postSchema>;

export type PostMetadata = z.infer<typeof postSchema>["metadata"];

export const postAdapter: EntityAdapter<Post, PostMetadata> = {
  entityType: "post",
  schema: postSchema,
  toMarkdown: (entity) => entity.content,
  fromMarkdown: () => ({}),
  extractMetadata: (entity) => entity.metadata,
  parseFrontMatter: <T>(_markdown: string, schema: z.ZodSchema<T>) =>
    schema.parse({}),
  generateFrontMatter: () => "",
};

// -- Minimal test entity (used in: storeEmbedding) --

export const minimalTestSchema = baseEntitySchema.extend({
  entityType: z.literal("test"),
});

export const minimalTestAdapter: EntityAdapter<BaseEntity> = {
  entityType: "test",
  schema: minimalTestSchema,
  toMarkdown: (entity) => entity.content,
  fromMarkdown: () => ({}),
  extractMetadata: () => ({}),
  parseFrontMatter: <T>(_markdown: string, schema: z.ZodSchema<T>) =>
    schema.parse({}),
  generateFrontMatter: () => "",
};

// -- Image entity (used in: embeddable-config) --

export const imageSchema = baseEntitySchema.extend({
  entityType: z.literal("image"),
});

export type ImageEntity = z.infer<typeof imageSchema>;

export const imageAdapter: EntityAdapter<ImageEntity> = {
  entityType: "image",
  schema: imageSchema,
  toMarkdown: (entity: ImageEntity): string => entity.content,
  fromMarkdown: (content: string): Partial<ImageEntity> => ({
    entityType: "image",
    content,
    metadata: {},
  }),
  extractMetadata: (): Record<string, unknown> => ({}),
  parseFrontMatter: <TFrontmatter>(
    _markdown: string,
    schema: z.ZodSchema<TFrontmatter>,
  ): TFrontmatter => schema.parse({}),
  generateFrontMatter: (): string => "",
};
