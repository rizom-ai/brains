import { z } from "@brains/utils";
import type { BaseEntity } from "../../src/types";
import { baseEntitySchema } from "../../src/types";
import { BaseEntityAdapter } from "../../src/adapters/base-entity-adapter";

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

const noteFrontmatterSchema = z.object({
  title: z.string(),
  tags: z.array(z.string()),
});

class NoteTestAdapter extends BaseEntityAdapter<Note> {
  constructor() {
    super({
      entityType: "note",
      schema: noteSchema,
      frontmatterSchema: noteFrontmatterSchema,
    });
  }

  public override toMarkdown(entity: Note): string {
    return `---\ntitle: ${entity.title}\ntags: ${JSON.stringify(entity.tags)}\n---\n\n${entity.content}`;
  }

  public fromMarkdown(markdown: string): Partial<Note> {
    const titleMatch = markdown.match(/title:\s*(.+)/);
    const title = titleMatch?.[1] ?? "Untitled";
    const bodyMatch = markdown.match(/---\n\n(.+)/s);
    const content = bodyMatch?.[1] ?? markdown;
    return { title, content, tags: [] };
  }
}

export const noteAdapter = new NoteTestAdapter();

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

const postFrontmatterSchema = z.object({
  status: z.string().optional(),
});

class PostTestAdapter extends BaseEntityAdapter<Post, PostMetadata> {
  constructor() {
    super({
      entityType: "post",
      schema: postSchema,
      frontmatterSchema: postFrontmatterSchema,
    });
  }

  public override toMarkdown(entity: Post): string {
    return entity.content;
  }

  public fromMarkdown(): Partial<Post> {
    return {};
  }
}

export const postAdapter = new PostTestAdapter();

// -- Minimal test entity (used in: storeEmbedding) --

export const minimalTestSchema = baseEntitySchema.extend({
  entityType: z.literal("test"),
});

const minimalFrontmatterSchema = z.object({});

class MinimalTestAdapter extends BaseEntityAdapter<BaseEntity> {
  constructor() {
    super({
      entityType: "test",
      schema: minimalTestSchema,
      frontmatterSchema: minimalFrontmatterSchema,
    });
  }

  public override toMarkdown(entity: BaseEntity): string {
    return entity.content;
  }

  public fromMarkdown(): Partial<BaseEntity> {
    return {};
  }
}

export const minimalTestAdapter = new MinimalTestAdapter();

// -- Image entity (used in: embeddable-config) --

export const imageSchema = baseEntitySchema.extend({
  entityType: z.literal("image"),
});

export type ImageEntity = z.infer<typeof imageSchema>;

const imageFrontmatterSchema = z.object({});

class ImageTestAdapter extends BaseEntityAdapter<ImageEntity> {
  constructor() {
    super({
      entityType: "image",
      schema: imageSchema,
      frontmatterSchema: imageFrontmatterSchema,
    });
  }

  public override toMarkdown(entity: ImageEntity): string {
    return entity.content;
  }

  public fromMarkdown(content: string): Partial<ImageEntity> {
    return {
      entityType: "image",
      content,
      metadata: {},
    };
  }
}

export const imageAdapter = new ImageTestAdapter();
