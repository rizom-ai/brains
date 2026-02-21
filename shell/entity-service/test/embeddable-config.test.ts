import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import {
  noteSchema,
  noteAdapter,
  imageSchema,
  imageAdapter,
  type Note,
  type ImageEntity,
} from "./helpers/test-schemas";
import {
  setupEntityService,
  type EntityServiceTestContext,
} from "./helpers/setup-entity-service";

describe("EntityTypeConfig embeddable flag", () => {
  let ctx: EntityServiceTestContext;

  beforeEach(async () => {
    ctx = await setupEntityService([
      { name: "note", schema: noteSchema, adapter: noteAdapter },
      {
        name: "image",
        schema: imageSchema,
        adapter: imageAdapter,
        config: { embeddable: false },
      },
    ]);
  });

  afterEach(async () => {
    await ctx.cleanup();
  });

  test("createEntity queues embedding job for embeddable entity types", async () => {
    const noteData = {
      entityType: "note" as const,
      title: "Test Note",
      content: "Some text content",
      tags: [],
      metadata: {},
    };

    await ctx.entityService.createEntity<Note>(noteData);

    expect(ctx.jobQueueService.enqueue).toHaveBeenCalled();
  });

  test("createEntity skips embedding job when embeddable is false", async () => {
    const imageData = {
      entityType: "image" as const,
      content:
        "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
      metadata: {},
    };

    const result = await ctx.entityService.createEntity<ImageEntity>(imageData);

    const entity = await ctx.entityService.getEntity<ImageEntity>(
      "image",
      result.entityId,
    );
    expect(entity).not.toBeNull();

    expect(ctx.jobQueueService.enqueue).not.toHaveBeenCalled();
  });

  test("updateEntity skips embedding job when embeddable is false", async () => {
    const imageData = {
      entityType: "image" as const,
      content:
        "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
      metadata: {},
    };

    const { entityId } =
      await ctx.entityService.createEntity<ImageEntity>(imageData);

    const entity = await ctx.entityService.getEntity<ImageEntity>(
      "image",
      entityId,
    );
    expect(entity).not.toBeNull();
    if (!entity) throw new Error("Entity should exist");

    await ctx.entityService.updateEntity<ImageEntity>({
      ...entity,
      content: "data:image/png;base64,UPDATED",
    });

    expect(ctx.jobQueueService.enqueue).not.toHaveBeenCalled();
  });

  test("createEntity returns empty jobId when embedding is skipped", async () => {
    const imageData = {
      entityType: "image" as const,
      content:
        "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
      metadata: {},
    };

    const result = await ctx.entityService.createEntity<ImageEntity>(imageData);

    expect(result.entityId).toBeDefined();
    expect(result.jobId).toBe("");
  });
});
