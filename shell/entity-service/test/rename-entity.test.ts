import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { createClient, type Client, type Row } from "@libsql/client";
import type { EntityExportIntent } from "../src/entity-export-types";
import { EntityWriteConflictError } from "../src/entity-write-contracts";
import type { BaseEntity, EntityEventBus } from "../src/types";
import { MOCK_DIMENSIONS } from "./helpers/mock-services";
import { minimalTestAdapter, minimalTestSchema } from "./helpers/test-schemas";
import {
  setupEntityService,
  type EntityServiceTestContext,
} from "./helpers/setup-entity-service";

/**
 * A rename gives an entity another id and keeps everything else: its text,
 * its metadata, its visibility and the day it was made. It is one change,
 * never a delete followed by a create, so nothing that follows an entity's
 * life (a new embedding, a vote on its topics) starts over.
 */
describe("renaming an entity (real SQLite)", () => {
  let ctx: EntityServiceTestContext;
  let client: Client;
  let events: Parameters<EntityEventBus["send"]>[0][];

  const read = (id: string): Promise<BaseEntity | null> =>
    ctx.entityService.getEntity({
      entityType: "test",
      id,
      visibilityScope: "restricted",
      source: true,
    });
  async function state(): Promise<{
    entities: Row[];
    fts: Row[];
    exports: EntityExportIntent[];
  }> {
    return {
      entities: (await client.execute("SELECT * FROM entities ORDER BY id"))
        .rows,
      fts: (await client.execute("SELECT * FROM entity_fts ORDER BY entity_id"))
        .rows,
      exports: await ctx.entityService.listPendingEntityExports(),
    };
  }
  const refusal = (promise: Promise<unknown>): Promise<unknown> =>
    promise.then(
      () => undefined,
      (error: unknown) => error,
    );

  beforeEach(async () => {
    events = [];
    ctx = await setupEntityService(
      [
        {
          name: "test",
          schema: minimalTestSchema,
          adapter: minimalTestAdapter,
        },
      ],
      {
        embeddingsEnabled: false,
        messageBus: {
          send: async (event) => {
            events.push(event);
          },
        },
      },
    );
    await ctx.entityService.initialize();
    client = createClient({ url: ctx.dbConfig.url });
    for (const id of ["draft", "taken"])
      await ctx.entityService.createEntity({
        entity: {
          id,
          entityType: "test",
          visibility: "restricted",
          content: `Text of ${id}`,
          metadata: { clientId: id },
          created: "2026-01-02T03:04:05.000Z",
        },
      });
    // What an export would have drained by now.
    await ctx.entityService.acknowledgeEntityExports({
      intents: await ctx.entityService.listPendingEntityExports(),
    });
    events.length = 0;
  });
  afterEach(async () => {
    client.close();
    ctx.entityService.close();
    await ctx.cleanup();
  });

  test("moves the entity to its new id and keeps everything else", async () => {
    const before = await read("draft");
    if (!before) throw new Error("Missing fixture");

    const result = await ctx.entityService.renameEntity({
      entityType: "test",
      id: "draft",
      newId: "final",
    });

    expect(result).toEqual({ renamed: true });
    expect(await read("draft")).toBeNull();
    const after = await read("final");
    expect(after).toMatchObject({
      id: "final",
      content: before.content,
      contentHash: before.contentHash,
      metadata: before.metadata,
      visibility: before.visibility,
      created: before.created,
    });
    const committed = await state();
    expect(committed.entities.map((row) => row["id"])).toEqual([
      "final",
      "taken",
    ]);
    // Search finds it under its new id, and only there.
    expect(committed.fts.map((row) => row["entity_id"])).toEqual([
      "final",
      "taken",
    ]);
    // The file is removed under the old name and written under the new one.
    expect(
      committed.exports
        .map(({ entityId, operation }) => `${operation} ${entityId}`)
        .sort(),
    ).toEqual(["delete draft", "upsert final"]);
  });

  test("says it was renamed, once, and neither deleted nor created", async () => {
    await ctx.entityService.renameEntity({
      entityType: "test",
      id: "draft",
      newId: "final",
      options: {
        eventContext: { actor: { kind: "user", userId: "editor" } },
      },
    });

    expect(events.map((event) => event.type)).toEqual(["entity:renamed"]);
    expect(events[0]?.payload).toMatchObject({
      entityType: "test",
      entityId: "final",
      previousId: "draft",
      actor: { kind: "user", userId: "editor" },
    });
  });

  test("refuses an id that is taken, and changes nothing", async () => {
    const before = await state();

    expect(
      await refusal(
        ctx.entityService.renameEntity({
          entityType: "test",
          id: "draft",
          newId: "taken",
        }),
      ),
    ).toBeInstanceOf(EntityWriteConflictError);
    expect(await state()).toEqual(before);
    expect(events).toEqual([]);
  });

  test("renames only the version the caller read", async () => {
    const before = await state();

    const result = await ctx.entityService.renameEntity({
      entityType: "test",
      id: "draft",
      newId: "final",
      options: { expectedContentHash: "an-older-version" },
    });

    expect(result).toEqual({ renamed: false, skipReason: "content-conflict" });
    expect(await state()).toEqual(before);
    expect(events).toEqual([]);
  });

  test("refuses an entity that is not there, the same id, and an empty one", async () => {
    for (const [id, newId] of [
      ["ghost", "final"],
      ["draft", "draft"],
      ["draft", ""],
    ] as const) {
      expect(
        await refusal(
          ctx.entityService.renameEntity({ entityType: "test", id, newId }),
        ),
      ).toBeInstanceOf(Error);
    }
    expect((await state()).entities.map((row) => row["id"])).toEqual([
      "draft",
      "taken",
    ]);
  });
});

describe("a renamed entity's embedding", () => {
  test("follows it to the new id, and nothing is embedded again", async () => {
    const ctx = await setupEntityService([
      { name: "test", schema: minimalTestSchema, adapter: minimalTestAdapter },
    ]);
    try {
      await ctx.entityService.initialize();
      await ctx.entityService.createEntity({
        entity: {
          id: "draft",
          entityType: "test",
          content: "Text of draft",
          metadata: { clientId: "draft" },
        },
      });
      const draft = await ctx.entityService.getEntity({
        entityType: "test",
        id: "draft",
      });
      if (!draft) throw new Error("Missing fixture");
      await ctx.entityService.storeEmbedding({
        entityId: "draft",
        entityType: "test",
        embedding: new Float32Array(MOCK_DIMENSIONS).fill(0.1),
        contentHash: draft.contentHash,
      });

      await ctx.entityService.renameEntity({
        entityType: "test",
        id: "draft",
        newId: "final",
      });

      // The embedding is the renamed entity's, and current: none is missing.
      expect((await ctx.entityService.backfillMissingEmbeddings()).queued).toBe(
        0,
      );
    } finally {
      ctx.entityService.close();
      await ctx.cleanup();
    }
  });
});
