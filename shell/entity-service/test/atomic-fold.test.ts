import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { createClient, type Client, type Row } from "@libsql/client";
import type { EntityExportIntent } from "../src/entity-export-types";
import type { ProjectionDirtyInput } from "../src/schema/projection-state";
import { EntityWriteConflictError } from "../src/entity-write-contracts";
import type {
  EntityEventBus,
  EntityWriteSnapshot,
  FoldEntityRequest,
} from "../src/types";
import { minimalTestAdapter, minimalTestSchema } from "./helpers/test-schemas";
import {
  setupEntityService,
  type EntityServiceTestContext,
} from "./helpers/setup-entity-service";

describe("native atomic entity fold (real SQLite)", () => {
  let ctx: EntityServiceTestContext;
  let client: Client;
  let events: Parameters<EntityEventBus["send"]>[0][];
  let request: FoldEntityRequest;

  async function snapshot(id: string): Promise<EntityWriteSnapshot> {
    const result = await ctx.entityService.getEntityWriteSnapshot({
      entityType: "test",
      id,
      visibilityScope: "restricted",
    });
    if (!result) throw new Error(`Missing fixture ${id}`);
    return result;
  }
  async function refusal(input: FoldEntityRequest): Promise<unknown> {
    return ctx.entityService.foldEntity(input).then(
      () => undefined,
      (error: unknown) => error,
    );
  }
  async function state(): Promise<{
    entities: Row[];
    fts: Row[];
    exports: EntityExportIntent[];
    dirty: ProjectionDirtyInput[];
  }> {
    return {
      entities: (await client.execute("SELECT * FROM entities ORDER BY id"))
        .rows,
      fts: (await client.execute("SELECT * FROM entity_fts ORDER BY entity_id"))
        .rows,
      exports: await ctx.entityService.listPendingEntityExports(),
      dirty: await ctx.entityService.getProjectionStore().listPendingInputs(),
    };
  }
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
    for (const id of ["source", "target"])
      await ctx.entityService.createEntity({
        entity: {
          id,
          entityType: "test",
          visibility: "restricted",
          content: `Answer ${id}`,
          metadata: { clientId: id },
        },
      });
    const source = await snapshot("source");
    const target = await snapshot("target");
    request = {
      source: {
        entityType: "test",
        id: "source",
        expectedRevision: source.revision,
      },
      targetRevision: target.revision,
      entity: { ...target.entity, content: "Merged answer" },
      options: {
        eventContext: {
          actor: { kind: "user", userId: "editor" },
          runId: "fold-run",
        },
      },
    };
    events.length = 0;
  });
  afterEach(async () => {
    client.close();
    ctx.entityService.close();
    await ctx.cleanup();
  });

  test("commits both rows, FTS, journals and attribution exactly once", async () => {
    expect((await ctx.entityService.foldEntity(request)).skipped).not.toBe(
      true,
    );
    const committed = await state();
    expect(committed.entities.map((row) => row["id"])).toEqual(["target"]);
    expect(committed.fts.map((row) => row["entity_id"])).toEqual(["target"]);
    expect((await snapshot("target")).entity.content).toContain(
      "Merged answer",
    );
    expect(
      committed.exports
        .map(({ entityId, operation }) => [entityId, operation])
        .sort(),
    ).toEqual([
      ["source", "delete"],
      ["target", "upsert"],
    ]);
    expect(
      committed.dirty
        .map(({ sourceId, operation }) => [sourceId, operation])
        .sort(),
    ).toEqual([
      ["source", "delete"],
      ["target", "upsert"],
    ]);
    expect(
      events.map((event) => [event.type, event.payload["entityId"]]),
    ).toEqual([
      ["entity:deleted", "source"],
      ["entity:updated", "target"],
    ]);
    for (const event of events)
      expect(event.payload).toMatchObject({
        actor: { kind: "user", userId: "editor" },
        runId: "fold-run",
      });
    expect(await refusal(request)).toBeInstanceOf(EntityWriteConflictError);
    expect(await state()).toEqual(committed);
  });

  for (const id of ["source", "target"]) {
    test.each(["content", "metadata", "visibility", "delete"] as const)(
      `rejects ${id} %s changes without touching either row or journal`,
      async (change) => {
        const observed = await snapshot(id);
        if (change === "delete")
          await ctx.entityService.deleteEntity({ entityType: "test", id });
        else
          await ctx.entityService.updateEntity({
            entity: {
              ...observed.entity,
              ...(change === "content" && { content: "New answer" }),
              ...(change === "metadata" && {
                metadata: { clientId: "new-owner" },
              }),
              ...(change === "visibility" && { visibility: "public" as const }),
            },
          });
        const latest = await state();
        events.length = 0;
        expect(await refusal(request)).toBeInstanceOf(EntityWriteConflictError);
        expect(await state()).toEqual(latest);
        expect(events).toHaveLength(0);
      },
    );
  }

  test.each(["source", "target"])(
    "checks %s again in the transaction after asynchronous validation",
    async (id) => {
      ctx.entityRegistry.registerPersistValidator("test", async () => {
        await client.execute({
          sql: "UPDATE entities SET metadata = ? WHERE id = ?",
          args: [JSON.stringify({ clientId: "raced" }), id],
        });
      });
      expect(await refusal(request)).toBeInstanceOf(EntityWriteConflictError);
      expect((await snapshot("source")).entity.content).toContain(
        "Answer source",
      );
      expect((await snapshot("target")).entity.content).toContain(
        "Answer target",
      );
      expect((await snapshot(id)).entity.metadata).toEqual({
        clientId: "raced",
      });
      expect(events).toHaveLength(0);
    },
  );

  test.each(["delete", "export", "projection"] as const)(
    "rolls back both entities, FTS and journals on %s failure",
    async (stage) => {
      const before = await state();
      // The delete trigger fires only AFTER the destination row was replaced.
      // Later triggers abort after both entity mutations have already executed.
      const trigger =
        stage === "delete"
          ? "BEFORE DELETE ON entities WHEN OLD.id = 'source' AND (SELECT content FROM entities WHERE id = 'target') LIKE '%Merged answer%'"
          : stage === "export"
            ? "BEFORE INSERT ON entity_export_intents"
            : "BEFORE INSERT ON projection_dirty_inputs";
      await client.execute(
        `CREATE TRIGGER fail_fold ${trigger} BEGIN SELECT RAISE(ABORT, 'injected fold failure'); END`,
      );
      expect(await refusal(request)).toBeInstanceOf(Error);
      expect(await state()).toEqual(before);
      expect(events).toHaveLength(0);
      await client.execute("DROP TRIGGER fail_fold");
      await ctx.entityService.foldEntity(request);
      expect((await snapshot("target")).entity.content).toContain(
        "Merged answer",
      );
      expect((await state()).entities).toHaveLength(1);
    },
  );

  test.each(["validation", "guard", "cancellation"] as const)(
    "preserves both snapshots on %s refusal",
    async (stage) => {
      const before = await state();
      if (stage === "validation")
        ctx.entityRegistry.registerPersistValidator("test", async () => {
          throw new Error("Policy refused");
        });
      if (stage === "guard")
        request.options = {
          beforeWrite: async (): Promise<void> => {
            throw new Error("Guard refused");
          },
        };
      if (stage === "cancellation")
        request.options = { signal: AbortSignal.abort(new Error("Cancelled")) };
      expect(await refusal(request)).toBeInstanceOf(Error);
      expect(await state()).toEqual(before);
      expect(events).toHaveLength(0);
    },
  );

  test("only one concurrent fold can consume a source", async () => {
    const outcomes = await Promise.allSettled([
      ctx.entityService.foldEntity(request),
      ctx.entityService.foldEntity(request),
    ]);
    expect(
      outcomes.filter((outcome) => outcome.status === "fulfilled"),
    ).toHaveLength(1);
    const rejected = outcomes.find((outcome) => outcome.status === "rejected");
    expect(rejected?.reason).toBeInstanceOf(EntityWriteConflictError);
    expect((await state()).entities).toHaveLength(1);
    expect(events).toHaveLength(2);
  });

  test("an unchanged destination still atomically consumes the source", async () => {
    request.entity = (await snapshot("target")).entity;
    await ctx.entityService.foldEntity(request);
    expect((await state()).entities).toHaveLength(1);
    expect((await snapshot("target")).entity.content).toContain(
      "Answer target",
    );
    expect(events).toHaveLength(2);
  });

  test("rejects self-folds, foreign types and widened visibility", async () => {
    const before = await state();
    for (const invalid of [
      { ...request, source: { ...request.source, id: "target" } },
      { ...request, source: { ...request.source, entityType: "foreign" } },
      {
        ...request,
        entity: { ...request.entity, visibility: "public" as const },
      },
    ])
      expect(await refusal(invalid)).toBeInstanceOf(Error);
    expect(await state()).toEqual(before);
  });
});
