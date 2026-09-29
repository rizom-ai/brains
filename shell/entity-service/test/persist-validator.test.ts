import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import {
  noteSchema,
  noteAdapter,
  createNoteInput,
} from "./helpers/test-schemas";
import {
  setupEntityService,
  type EntityServiceTestContext,
} from "./helpers/setup-entity-service";

describe("EntityRegistry persist validators", () => {
  let ctx: EntityServiceTestContext;

  beforeEach(async () => {
    ctx = await setupEntityService([
      { name: "note", schema: noteSchema, adapter: noteAdapter },
    ]);
  });

  afterEach(async () => {
    await ctx.cleanup();
  });

  test("createEntity invokes the registered validator and rejects on throw", async () => {
    ctx.entityRegistry.registerPersistValidator("note", async () => {
      throw new Error("nope");
    });

    expect(
      ctx.entityService.createEntity({
        entity: createNoteInput({
          title: "Blocked",
          content: "Should not persist",
          tags: [],
        }),
      }),
    ).rejects.toThrow("nope");
  });

  test("additional validators cannot replace an owner's persistence constraint", async () => {
    const calls: string[] = [];
    ctx.entityRegistry.registerPersistValidator("note", async () => {
      calls.push("owner");
      throw new Error("Owner constraint");
    });
    ctx.entityRegistry.registerPersistValidator("note", async () => {
      calls.push("grouping");
    });
    const error = await ctx.entityService
      .createEntity({
        entity: createNoteInput({
          title: "Blocked",
          content: "Body",
          tags: [],
        }),
      })
      .catch((cause: unknown) => cause);
    expect(error).toMatchObject({ message: "Owner constraint" });
    expect(calls).toEqual(["owner"]);
  });

  test("all registered validators run in order on create and update", async () => {
    const calls: string[] = [];
    for (const name of ["owner", "grouping"]) {
      ctx.entityRegistry.registerPersistValidator(
        "note",
        async (_, context) => {
          calls.push(`${name}:${context.operation}`);
        },
      );
    }
    const { entityId } = await ctx.entityService.createEntity({
      entity: createNoteInput({ title: "Original", content: "Body", tags: [] }),
    });
    const entity = await ctx.entityService.getEntity({
      entityType: "note",
      id: entityId,
    });
    if (!entity) throw new Error("Missing entity");
    await ctx.entityService.updateEntity({
      entity: { ...entity, content: "Changed" },
    });
    expect(calls).toEqual([
      "owner:create",
      "grouping:create",
      "owner:update",
      "grouping:update",
    ]);
  });

  test("updateEntity invokes the registered validator with operation 'update'", async () => {
    const seen: Array<"create" | "update"> = [];
    ctx.entityRegistry.registerPersistValidator("note", async (_, context) => {
      seen.push(context.operation);
    });

    const { entityId } = await ctx.entityService.createEntity({
      entity: createNoteInput({
        title: "Original",
        content: "First",
        tags: [],
      }),
    });

    const existing = await ctx.entityService.getEntity({
      entityType: "note",
      id: entityId,
    });
    if (!existing) throw new Error("Entity should exist");

    await ctx.entityService.updateEntity({
      entity: { ...existing, content: "Second" },
    });

    expect(seen).toEqual(["create", "update"]);
  });
});
