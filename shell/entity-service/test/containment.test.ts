import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import {
  createNoteInput,
  noteAdapter,
  noteSchema,
  postAdapter,
  postSchema,
} from "./helpers/test-schemas";
import {
  setupEntityService,
  type EntityServiceTestContext,
} from "./helpers/setup-entity-service";

/** The error a promise rejects with; undefined when it resolves. */
function failureOf(promise: Promise<unknown>): Promise<unknown> {
  return promise.then(
    () => undefined,
    (error: unknown) => error,
  );
}

describe("contained entity types", () => {
  let ctx: EntityServiceTestContext;

  beforeEach(async () => {
    // Posts contained in notes, as a book's sections are in their book.
    ctx = await setupEntityService([
      { name: "note", schema: noteSchema, adapter: noteAdapter },
      {
        name: "post",
        schema: postSchema,
        adapter: postAdapter,
        config: { containedIn: "note" },
      },
    ]);
  });

  afterEach(async () => {
    await ctx.cleanup();
  });

  const note = (id: string): Promise<unknown> =>
    ctx.entityService.createEntity({
      entity: createNoteInput({ title: id, content: id, tags: [] }, id),
    });
  const post = (id: string): Promise<unknown> =>
    ctx.entityService.createEntity({
      entity: { id, entityType: "post", content: id, metadata: {} },
    });
  const exists = async (entityType: string, id: string): Promise<boolean> =>
    (await ctx.entityService.getEntity({ entityType, id })) !== null;

  test("keeps a container's ids flat", async () => {
    expect(String(await failureOf(note("a:b")))).toContain("flat");
  });

  test("starts a contained entity's id with its container's", async () => {
    expect(String(await failureOf(post("lone")))).toContain("container");
  });

  test("deletes a container's contents with it, and only its own", async () => {
    await note("a");
    await note("ab");
    await post("a:1");
    await post("a:2");
    await post("ab:1");

    await ctx.entityService.deleteEntity({ entityType: "note", id: "a" });

    expect(await exists("note", "a")).toBe(false);
    expect(await exists("post", "a:1")).toBe(false);
    expect(await exists("post", "a:2")).toBe(false);
    expect(await exists("note", "ab")).toBe(true);
    expect(await exists("post", "ab:1")).toBe(true);
  });
});
