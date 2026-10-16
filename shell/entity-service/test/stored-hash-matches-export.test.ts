import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { computeContentHash } from "@brains/utils/hash";
import { createTestEntity } from "../src/test/index";
import { postAdapter, postSchema } from "./helpers/test-schemas";
import {
  setupEntityService,
  type EntityServiceTestContext,
} from "./helpers/setup-entity-service";

/**
 * Directory sync writes `serializeEntity(entity)` to disk and recognizes its
 * own exports coming back by comparing the file's hash with the stored
 * contentHash. The two must stay the same hash.
 */
describe("stored contentHash", () => {
  let ctx: EntityServiceTestContext;

  beforeEach(async () => {
    ctx = await setupEntityService([
      { name: "post", schema: postSchema, adapter: postAdapter },
    ]);
    await ctx.entityService.initialize();
  });

  afterEach(async () => {
    await ctx.cleanup();
  });

  async function storedAndExportHashes(id: string): Promise<[string, string]> {
    const stored = await ctx.entityService.getEntity({
      entityType: "post",
      id,
    });
    if (!stored) throw new Error(`post ${id} is missing`);
    return [
      stored.contentHash,
      computeContentHash(ctx.entityService.serializeEntity(stored)),
    ];
  }

  test("is the hash of the entity's export after create and update", async () => {
    await ctx.entityService.createEntity({
      entity: createTestEntity("post", {
        id: "minutes",
        content: "First draft of the minutes.",
        metadata: { status: "draft" },
      }),
    });
    const [created, createdExport] = await storedAndExportHashes("minutes");
    expect(created).toBe(createdExport);

    const current = await ctx.entityService.getEntity({
      entityType: "post",
      id: "minutes",
    });
    if (!current) throw new Error("created post is missing");
    await ctx.entityService.updateEntity({
      entity: {
        ...current,
        content: "Approved minutes.",
        metadata: { status: "approved" },
      },
    });
    const [updated, updatedExport] = await storedAndExportHashes("minutes");
    expect(updated).not.toBe(created);
    expect(updated).toBe(updatedExport);
  });
});
