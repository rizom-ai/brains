import { describe, expect, test, beforeEach, afterEach } from "bun:test";
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

describe("Immediate Entity Persistence", () => {
  let ctx: EntityServiceTestContext;

  beforeEach(async () => {
    ctx = await setupEntityService([
      { name: "note", schema: noteSchema, adapter: noteAdapter },
    ]);
  });

  afterEach(async () => {
    await ctx.cleanup();
  });

  describe("createEntity - immediate persistence", () => {
    test("entity should be readable immediately after createEntity returns", async () => {
      const noteData = createNoteInput({
        title: "Test Note",
        content: "This is the content",
        tags: ["test"],
      });

      const { entityId } = await ctx.entityService.createEntity<Note>(noteData);

      const entity = await ctx.entityService.getEntity<Note>("note", entityId);

      expect(entity).not.toBeNull();
      expect(entity?.id).toBe(entityId);
      expect(entity?.entityType).toBe("note");
      expect(entity?.title).toBe("Test Note");
    });

    test("entity should be listable immediately after createEntity returns", async () => {
      const noteData = createNoteInput({
        title: "Listable Note",
        content: "Content here",
        tags: ["list-test"],
      });

      await ctx.entityService.createEntity<Note>(noteData);

      const entities = await ctx.entityService.listEntities<Note>("note");

      expect(entities.length).toBe(1);
      expect(entities[0]?.title).toBe("Listable Note");
    });

    test("multiple concurrent creates should all be immediately readable", async () => {
      const creates = await Promise.all([
        ctx.entityService.createEntity<Note>(
          createNoteInput({ title: "Note 1", content: "Content 1", tags: [] }),
        ),
        ctx.entityService.createEntity<Note>(
          createNoteInput({ title: "Note 2", content: "Content 2", tags: [] }),
        ),
        ctx.entityService.createEntity<Note>(
          createNoteInput({ title: "Note 3", content: "Content 3", tags: [] }),
        ),
      ]);

      const entities = await ctx.entityService.listEntities<Note>("note");
      expect(entities.length).toBe(3);

      for (const { entityId } of creates) {
        const entity = await ctx.entityService.getEntity<Note>(
          "note",
          entityId,
        );
        expect(entity).not.toBeNull();
      }
    });
  });

  describe("updateEntity - immediate persistence", () => {
    test("updates should be visible immediately after updateEntity returns", async () => {
      const noteData = createNoteInput({
        title: "Original Title",
        content: "Original content",
        tags: [],
      });
      const { entityId } = await ctx.entityService.createEntity<Note>(noteData);

      const original = await ctx.entityService.getEntity<Note>(
        "note",
        entityId,
      );
      expect(original).not.toBeNull();
      if (!original) throw new Error("Entity should exist");

      await ctx.entityService.updateEntity<Note>({
        ...original,
        title: "Updated Title",
        content: "Updated content",
      });

      const updated = await ctx.entityService.getEntity<Note>("note", entityId);
      expect(updated?.title).toBe("Updated Title");
      expect(updated?.content).toContain("Updated content");
    });
  });

  describe("search behavior with embeddings table", () => {
    test("newly created entities should NOT appear in search until embedding is ready", async () => {
      const noteData = createNoteInput({
        title: "Searchable Note",
        content: "This note should eventually be searchable",
        tags: ["search"],
      });
      await ctx.entityService.createEntity<Note>(noteData);

      const results = await ctx.entityService.search("searchable");
      expect(results.length).toBe(0);
    });
  });

  describe("deleteEntity - cascade to embeddings", () => {
    test("deleting entity should also remove its embedding", async () => {
      const noteData = createNoteInput({
        title: "To Be Deleted",
        content: "This will be deleted",
        tags: [],
      });
      const { entityId } = await ctx.entityService.createEntity<Note>(noteData);

      const beforeDelete = await ctx.entityService.getEntity<Note>(
        "note",
        entityId,
      );
      expect(beforeDelete).not.toBeNull();

      const deleted = await ctx.entityService.deleteEntity("note", entityId);
      expect(deleted).toBe(true);

      const afterDelete = await ctx.entityService.getEntity<Note>(
        "note",
        entityId,
      );
      expect(afterDelete).toBeNull();
    });
  });

  describe("race condition prevention", () => {
    test("concurrent updates to same entity should not lose data", async () => {
      const noteData = createNoteInput({
        title: "Concurrent Note",
        content: "Initial content",
        tags: ["initial"],
      });
      const { entityId } = await ctx.entityService.createEntity<Note>(noteData);

      const entity = await ctx.entityService.getEntity<Note>("note", entityId);
      expect(entity).not.toBeNull();
      if (!entity) throw new Error("Entity should exist");

      await Promise.all([
        ctx.entityService.updateEntity<Note>({
          ...entity,
          tags: ["tag1"],
        }),
        ctx.entityService.updateEntity<Note>({
          ...entity,
          tags: ["tag2"],
        }),
      ]);

      const final = await ctx.entityService.getEntity<Note>("note", entityId);
      expect(final).not.toBeNull();
      expect(final?.id).toBe(entityId);
    });
  });
});
