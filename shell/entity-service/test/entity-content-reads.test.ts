import { afterEach, beforeEach, expect, test, spyOn } from "bun:test";
import { createTestEntity } from "../src/test";
import {
  setupEntityService,
  type EntityServiceTestContext,
} from "./helpers/setup-entity-service";
import { minimalTestAdapter, minimalTestSchema } from "./helpers/test-schemas";

let ctx: EntityServiceTestContext;
beforeEach(async () => {
  ctx = await setupEntityService([
    { name: "test", schema: minimalTestSchema, adapter: minimalTestAdapter },
  ]);
});
afterEach(async () => {
  await ctx.cleanup();
});

test("entity reads preserve image references without nested reads", async () => {
  const entity = createTestEntity("test", {
    id: "logical-content",
    content:
      "![Cover](entity://image/cover)\n\n`![Code](entity://image/code)`\n\n![Missing](entity://image/missing)",
  });
  await ctx.entityService.createEntity({ entity });
  const rawRead = spyOn(ctx.entityService, "getEntityRaw");
  const readAsset = spyOn(ctx.entityService, "readAsset").mockImplementation(
    async (): Promise<never> => {
      throw new Error("Controller asset read forbidden");
    },
  );
  try {
    const request = {
      entityType: "test",
      id: entity.id,
    };
    const result = await ctx.entityService.getEntity(
      request,
      minimalTestSchema,
    );
    expect(result?.content).toBe(entity.content);
    expect(rawRead).toHaveBeenCalledTimes(1);
    expect(rawRead).toHaveBeenCalledWith(request);
    expect(readAsset).not.toHaveBeenCalled();
  } finally {
    rawRead.mockRestore();
    readAsset.mockRestore();
  }
});

test("logical content reads retain visibility and cancellation gates", async () => {
  const entity = createTestEntity("test", {
    id: "restricted-content",
    visibility: "restricted",
    content: "![Private](entity://image/private)",
  });
  await ctx.entityService.createEntity({ entity });
  expect(
    await ctx.entityService.getEntity({ entityType: "test", id: entity.id }),
  ).toBeNull();
  const request = {
    entityType: "test",
    id: entity.id,
    visibilityScope: "restricted" as const,
  };
  const stored = await ctx.entityService.getEntityRaw(request);
  expect(stored?.content).toContain(entity.content);
  expect(await ctx.entityService.getEntity(request)).toEqual(stored);
  const rawRead = spyOn(ctx.entityService, "getEntityRaw");
  try {
    const reason = new Error("Cancelled entity read");
    await ctx.entityService
      .getEntity({
        entityType: "test",
        id: entity.id,
        signal: AbortSignal.abort(reason),
      })
      .then(
        () => {
          throw new Error("Unexpected successful read");
        },
        (error: unknown) => {
          expect(error).toBe(reason);
        },
      );
    expect(rawRead).not.toHaveBeenCalled();
  } finally {
    rawRead.mockRestore();
  }
});
