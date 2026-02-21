import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import { z } from "@brains/utils";
import { baseEntitySchema } from "../src/types";
import type { EntityAdapter } from "../src/types";
import {
  noteSchema,
  noteAdapter,
  createNoteInput,
  type Note,
} from "./helpers/test-schemas";
import {
  setupEntityService,
  type EntityServiceTestContext,
} from "./helpers/setup-entity-service";

describe("deduplicateId option", () => {
  let ctx: EntityServiceTestContext;

  beforeEach(async () => {
    ctx = await setupEntityService([
      { name: "note", schema: noteSchema, adapter: noteAdapter },
    ]);
  });

  afterEach(async () => {
    await ctx.cleanup();
  });

  test("without deduplicateId, duplicate ID should throw", async () => {
    const noteData = createNoteInput(
      { title: "My Note", content: "Content", tags: [] },
      "my-note",
    );

    await ctx.entityService.createEntity<Note>(noteData);

    let threw = false;
    try {
      await ctx.entityService.createEntity<Note>(noteData);
    } catch {
      threw = true;
    }
    expect(threw).toBe(true);
  });

  test("with deduplicateId, duplicate ID should get -2 suffix", async () => {
    const noteData = createNoteInput(
      { title: "My Note", content: "Content", tags: [] },
      "my-note",
    );

    const first = await ctx.entityService.createEntity<Note>(noteData);
    expect(first.entityId).toBe("my-note");

    const second = await ctx.entityService.createEntity<Note>(noteData, {
      deduplicateId: true,
    });
    expect(second.entityId).toBe("my-note-2");

    const entity1 = await ctx.entityService.getEntity<Note>("note", "my-note");
    const entity2 = await ctx.entityService.getEntity<Note>(
      "note",
      "my-note-2",
    );
    expect(entity1).not.toBeNull();
    expect(entity2).not.toBeNull();
  });

  test("with deduplicateId, triple collision should get -3 suffix", async () => {
    const noteData = createNoteInput(
      { title: "My Note", content: "Content", tags: [] },
      "my-note",
    );

    await ctx.entityService.createEntity<Note>(noteData);
    await ctx.entityService.createEntity<Note>(noteData, {
      deduplicateId: true,
    });

    const third = await ctx.entityService.createEntity<Note>(noteData, {
      deduplicateId: true,
    });
    expect(third.entityId).toBe("my-note-3");

    const entities = await ctx.entityService.listEntities<Note>("note");
    expect(entities).toHaveLength(3);
  });

  test("deduplicateId with no collision should use original ID", async () => {
    const noteData = createNoteInput(
      { title: "Unique Note", content: "Content", tags: [] },
      "unique-note",
    );

    const result = await ctx.entityService.createEntity<Note>(noteData, {
      deduplicateId: true,
    });
    expect(result.entityId).toBe("unique-note");
  });

  test("deduplicateId respects composite key (id + entityType)", async () => {
    const articleSchema = baseEntitySchema.extend({
      entityType: z.literal("article"),
      title: z.string(),
    });

    type Article = z.infer<typeof articleSchema>;

    const articleAdapter: EntityAdapter<Article> = {
      entityType: "article",
      schema: articleSchema,
      toMarkdown: (entity: Article): string =>
        `---\ntitle: ${entity.title}\n---\n\n${entity.content}`,
      fromMarkdown: (markdown: string): Partial<Article> => {
        const titleMatch = markdown.match(/title:\s*(.+)/);
        const title = titleMatch?.[1] ?? "Untitled";
        return { title, content: markdown };
      },
      extractMetadata: (entity: Article): Record<string, unknown> => ({
        title: entity.title,
      }),
      parseFrontMatter: <TFrontmatter>(
        _markdown: string,
        schema: z.ZodSchema<TFrontmatter>,
      ): TFrontmatter => schema.parse({}),
      generateFrontMatter: (entity: Article): string => {
        return `---\ntitle: ${entity.title}\n---\n`;
      },
    };

    ctx.entityRegistry.registerEntityType(
      "article",
      articleSchema,
      articleAdapter,
    );

    const noteData = createNoteInput(
      { title: "Note", content: "Note content", tags: [] },
      "shared-id",
    );
    await ctx.entityService.createEntity<Note>(noteData);

    const articleData: Omit<
      Article,
      "id" | "created" | "updated" | "contentHash"
    > & {
      id?: string;
    } = {
      id: "shared-id",
      entityType: "article" as const,
      title: "Article",
      content: "Article content",
      metadata: {},
    };

    const result = await ctx.entityService.createEntity<Article>(articleData);
    expect(result.entityId).toBe("shared-id");
  });
});
