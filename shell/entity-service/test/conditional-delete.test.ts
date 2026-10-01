import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import {
  noteAdapter,
  noteSchema,
  createNoteInput,
} from "./helpers/test-schemas";
import {
  setupEntityService,
  type EntityServiceTestContext,
} from "./helpers/setup-entity-service";

describe("deleteEntity with an expected content hash", () => {
  let ctx: EntityServiceTestContext;

  beforeEach(async () => {
    ctx = await setupEntityService([
      { name: "note", schema: noteSchema, adapter: noteAdapter },
    ]);
  });

  afterEach(async () => {
    await ctx.cleanup();
  });

  async function createNote(): Promise<{ id: string; contentHash: string }> {
    const { entityId } = await ctx.entityService.createEntity({
      entity: createNoteInput({ title: "Draft", content: "Body", tags: [] }),
    });
    const note = await ctx.entityService.getEntity(
      { entityType: "note", id: entityId },
      noteSchema,
    );
    if (!note) throw new Error("Note should exist");
    return { id: note.id, contentHash: note.contentHash };
  }

  test("deletes the version that was read", async () => {
    const note = await createNote();

    const deleted = await ctx.entityService.deleteEntity({
      entityType: "note",
      id: note.id,
      options: { expectedContentHash: note.contentHash },
    });

    expect(deleted).toBe(true);
    expect(
      await ctx.entityService.getEntity({ entityType: "note", id: note.id }),
    ).toBeNull();
  });

  test("keeps an entity that changed since it was read", async () => {
    const note = await createNote();
    const current = await ctx.entityService.getEntity(
      { entityType: "note", id: note.id },
      noteSchema,
    );
    if (!current) throw new Error("Note should exist");
    await ctx.entityService.updateEntity({
      entity: { ...current, content: "Changed meanwhile" },
    });

    const deleted = await ctx.entityService.deleteEntity({
      entityType: "note",
      id: note.id,
      options: { expectedContentHash: note.contentHash },
    });

    expect(deleted).toBe(false);
    const kept = await ctx.entityService.getEntity(
      { entityType: "note", id: note.id },
      noteSchema,
    );
    expect(kept?.content).toContain("Changed meanwhile");
  });
});
