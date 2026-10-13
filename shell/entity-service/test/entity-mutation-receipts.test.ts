import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { createClient, type Client, type Row } from "@libsql/client";
import {
  setupEntityService,
  type EntityServiceTestContext,
} from "./helpers/setup-entity-service";
import { minimalTestAdapter, minimalTestSchema } from "./helpers/test-schemas";
import { EntityWriteConflictError } from "../src/entity-write-contracts";
import type {
  ApplyEntityMutationOnceRequest,
  EntityEventBus,
  EntityWriteSnapshot,
} from "../src/types";

const key = { namespace: "native-test", key: "operation" };
describe("native entity mutation receipts (real SQLite)", () => {
  let ctx: EntityServiceTestContext;
  let client: Client;
  let events: Parameters<EntityEventBus["send"]>[0][];
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
  });
  afterEach(async () => {
    client.close();
    ctx.entityService.close();
    await ctx.cleanup();
  });
  function creation(id = "target"): ApplyEntityMutationOnceRequest {
    return {
      receipt: key,
      operation: "create",
      request: {
        entity: {
          id,
          entityType: "test",
          visibility: "restricted",
          content: "Original answer",
          metadata: { clientId: "editor" },
        },
        options: {
          eventContext: {
            actor: { kind: "user", userId: "editor" },
            runId: "receipt-run",
          },
        },
      },
    };
  }
  async function snapshot(id = "target"): Promise<EntityWriteSnapshot> {
    const current = await ctx.entityService.getEntityWriteSnapshot({
      entityType: "test",
      id,
      visibilityScope: "restricted",
    });
    if (!current) throw new Error("Missing test entity");
    return current;
  }
  async function state(): Promise<Row[][]> {
    const tables = [
      "entities",
      "entity_fts",
      "entity_mutation_receipts",
      "entity_export_intents",
      "projection_dirty_inputs",
      "projection_entity_owners",
    ];
    return Promise.all(
      tables.map(
        async (table) =>
          (await client.execute(`SELECT * FROM ${table} ORDER BY rowid`)).rows,
      ),
    );
  }
  async function refusal(
    request: ApplyEntityMutationOnceRequest,
  ): Promise<unknown> {
    return ctx.entityService
      .applyEntityMutationOnce(request)
      .catch((error: unknown) => error);
  }

  test("creates once with journals and attribution; a replay cannot pick another destination", async () => {
    const first = await ctx.entityService.applyEntityMutationOnce(creation());
    const committed = await state();
    expect(first).toEqual({
      operation: "create",
      entityType: "test",
      entityId: "target",
    });
    expect(events).toHaveLength(1);
    expect(events[0]?.payload).toMatchObject({
      actor: { kind: "user", userId: "editor" },
      runId: "receipt-run",
    });
    expect(
      await ctx.entityService.applyEntityMutationOnce(creation("other")),
    ).toEqual(first);
    expect(await state()).toEqual(committed);
    expect(events).toHaveLength(1);
    expect(await ctx.entityService.listPendingEntityExports()).toHaveLength(1);
    expect(
      await ctx.entityService.getProjectionStore().listPendingInputs(),
    ).toHaveLength(1);
  });

  test("receipts survive destination deletion without resurrection", async () => {
    const first = await ctx.entityService.applyEntityMutationOnce(creation());
    await ctx.entityService.deleteEntity({ entityType: "test", id: "target" });
    const deleted = await state();
    expect(await ctx.entityService.applyEntityMutationOnce(creation())).toEqual(
      first,
    );
    expect(await state()).toEqual(deleted);
  });

  test("folding a captured source does not reopen its receipt", async () => {
    const first = await ctx.entityService.applyEntityMutationOnce(
      creation("source"),
    );
    const targetRequest = creation("target");
    if (targetRequest.operation !== "create")
      throw new Error("Expected create");
    await ctx.entityService.createEntity(targetRequest.request);
    const source = await snapshot("source");
    const target = await snapshot("target");
    await ctx.entityService.foldEntity({
      source: {
        entityType: "test",
        id: "source",
        expectedRevision: source.revision,
      },
      targetRevision: target.revision,
      entity: { ...target.entity, content: "Combined answer" },
    });
    const folded = await state();
    expect(
      await ctx.entityService.applyEntityMutationOnce(creation("source")),
    ).toEqual(first);
    expect(await state()).toEqual(folded);
    expect(
      (await client.execute("SELECT id FROM entities")).rows.map(
        (row) => row["id"],
      ),
    ).toEqual(["target"]);
  });

  test("negative completion and a proposed write share one immutable identity", async () => {
    expect(
      await ctx.entityService.applyEntityMutationOnce({
        receipt: key,
        operation: "none",
      }),
    ).toEqual({ operation: "none" });
    const terminal = await state();
    expect(await ctx.entityService.applyEntityMutationOnce(creation())).toEqual(
      { operation: "none" },
    );
    expect(await state()).toEqual(terminal);
    const otherKey = { ...key, namespace: "another-owner" };
    const create = { ...creation(), receipt: otherKey };
    const winner = await ctx.entityService.applyEntityMutationOnce(create);
    expect(
      await ctx.entityService.applyEntityMutationOnce({
        receipt: otherKey,
        operation: "none",
      }),
    ).toEqual(winner);
    expect(events).toHaveLength(1);
  });

  test("full revision conflicts do not consume a receipt; corrected retries apply once", async () => {
    await ctx.entityService.applyEntityMutationOnce(creation());
    const original = await snapshot();
    const request: ApplyEntityMutationOnceRequest = {
      operation: "update",
      receipt: { ...key, key: "update" },
      request: {
        entity: { ...original.entity, content: "Updated once" },
        options: { conditionalWrite: { expectedRevision: original.revision } },
      },
    };
    await ctx.entityService.updateEntity({
      entity: { ...original.entity, metadata: { clientId: "someone-else" } },
    });
    expect(await refusal(request)).toBeInstanceOf(EntityWriteConflictError);
    expect(
      await ctx.entityService.getEntityMutationReceipt(request.receipt),
    ).toBeNull();
    const current = await snapshot();
    request.request.options = {
      conditionalWrite: { expectedRevision: current.revision },
    };
    const applied = await ctx.entityService.applyEntityMutationOnce(request);
    const committed = await state();
    expect(await ctx.entityService.applyEntityMutationOnce(request)).toEqual(
      applied,
    );
    expect(await state()).toEqual(committed);
    expect((await snapshot()).entity.content).toContain("Updated once");
  });

  test("content hash conflict does not consume a receipt", async () => {
    await ctx.entityService.applyEntityMutationOnce(creation());
    const original = await snapshot();
    const request: ApplyEntityMutationOnceRequest = {
      operation: "update",
      receipt: { ...key, key: "stale" },
      request: {
        entity: original.entity,
        options: { expectedContentHash: "stale" },
      },
    };
    const before = await state();
    expect(await refusal(request)).toBeInstanceOf(EntityWriteConflictError);
    expect(await state()).toEqual(before);
  });

  test("unchanged updates still record a receipt atomically", async () => {
    await ctx.entityService.applyEntityMutationOnce(creation());
    const original = await snapshot();
    const input: ApplyEntityMutationOnceRequest = {
      receipt: { ...key, key: "unchanged" },
      operation: "update",
      request: { entity: original.entity },
    };
    expect(
      await ctx.entityService.applyEntityMutationOnce(input),
    ).toMatchObject({ operation: "update" });
    const committed = await state();
    await ctx.entityService.applyEntityMutationOnce(input);
    expect(await state()).toEqual(committed);
  });

  for (const operation of ["create", "update"] as const) {
    for (const table of [
      "entity_mutation_receipts",
      "entity_export_intents",
      "projection_dirty_inputs",
    ]) {
      test(`${operation} rolls back entities, FTS, receipts and journals when ${table} refuses`, async () => {
        let input = creation();
        if (operation === "update") {
          await ctx.entityService.applyEntityMutationOnce(input);
          input = {
            receipt: { ...key, key: "update" },
            operation,
            request: {
              entity: {
                ...(await snapshot()).entity,
                content: "Replacement answer",
              },
            },
          };
        }
        const before = await state();
        await client.execute(
          `CREATE TRIGGER refuse_receipt_test BEFORE INSERT ON ${table} BEGIN SELECT RAISE(ABORT, 'forced receipt rollback'); END`,
        );
        expect(await refusal(input)).toBeInstanceOf(Error);
        expect(await state()).toEqual(before);
        expect(
          await ctx.entityService.getEntityMutationReceipt(input.receipt),
        ).toBeNull();
        await client.execute("DROP TRIGGER refuse_receipt_test");
        expect(
          await ctx.entityService.applyEntityMutationOnce(input),
        ).toMatchObject({ operation });
      });
    }
  }

  test("guard failure and cancellation cannot mark a write complete", async () => {
    const input = creation();
    if (input.operation !== "create") throw new Error("Expected creation");
    input.request.options = {
      beforeWrite: async (): Promise<void> => {
        throw new Error("Guard refused");
      },
    };
    expect(await refusal(input)).toBeInstanceOf(Error);
    expect(await ctx.entityService.getEntityMutationReceipt(key)).toBeNull();
    input.request.options = { signal: AbortSignal.abort() };
    expect(await refusal(input)).toBeInstanceOf(Error);
    expect(await ctx.entityService.getEntityMutationReceipt(key)).toBeNull();
    input.request.options = {};
    expect(
      await ctx.entityService.applyEntityMutationOnce(input),
    ).toMatchObject({ operation: "create" });
  });

  test("snapshots caller identity, entity and attribution before awaiting", async () => {
    const input = creation();
    if (input.operation !== "create") throw new Error("Expected creation");
    input.receipt = { ...key };
    const pending = ctx.entityService.applyEntityMutationOnce(input);
    input.receipt.key = "changed";
    input.request.entity.metadata["clientId"] = "changed";
    input.request.entity.id = "changed";
    input.request.options = {};
    expect(await pending).toMatchObject({ entityId: "target" });
    expect(await ctx.entityService.getEntityMutationReceipt(key)).toMatchObject(
      { entityId: "target" },
    );
    expect((await snapshot()).entity.metadata["clientId"]).toBe("editor");
    expect(events[0]?.payload).toMatchObject({
      actor: { kind: "user", userId: "editor" },
    });
  });

  for (const operation of ["create", "update"] as const) {
    test(`${operation} respects persist-policy rejection without consuming a receipt`, async () => {
      let input = creation();
      if (operation === "update") {
        await ctx.entityService.applyEntityMutationOnce(input);
        input = {
          receipt: { ...key, key: "refused-update" },
          operation,
          request: {
            entity: { ...(await snapshot()).entity, content: "Refused answer" },
          },
        };
      }
      const before = await state();
      ctx.entityRegistry.registerPersistValidator("test", async () => {
        throw new Error("Policy refused");
      });
      expect(await refusal(input)).toBeInstanceOf(Error);
      expect(await state()).toEqual(before);
      expect(
        await ctx.entityService.getEntityMutationReceipt(input.receipt),
      ).toBeNull();
    });
  }

  test("rechecks a full revision after asynchronous persist validation", async () => {
    await ctx.entityService.applyEntityMutationOnce(creation());
    const original = await snapshot();
    let interleaved = false;
    ctx.entityRegistry.registerPersistValidator("test", async () => {
      if (interleaved) return;
      interleaved = true;
      await ctx.entityService.updateEntity({
        entity: { ...original.entity, metadata: { clientId: "concurrent" } },
      });
    });
    const input: ApplyEntityMutationOnceRequest = {
      receipt: { ...key, key: "raced-update" },
      operation: "update",
      request: {
        entity: { ...original.entity, content: "Stale answer" },
        options: { conditionalWrite: { expectedRevision: original.revision } },
      },
    };
    expect(await refusal(input)).toBeInstanceOf(EntityWriteConflictError);
    expect(
      await ctx.entityService.getEntityMutationReceipt(input.receipt),
    ).toBeNull();
    expect((await snapshot()).entity.metadata["clientId"]).toBe("concurrent");
    expect((await snapshot()).entity.content).not.toContain("Stale answer");
  });

  test("concurrent proposals return one receipt and do not replay the losing write guard", async () => {
    let validations = 0;
    let guards = 0;
    const ready = Promise.withResolvers<void>();
    ctx.entityRegistry.registerPersistValidator("test", async () => {
      if (++validations === 2) ready.resolve();
      await ready.promise;
    });
    const inputs = [creation("left"), creation("right")];
    for (const input of inputs) {
      if (input.operation !== "create") throw new Error("Expected create");
      input.request.options = {
        beforeWrite: async (): Promise<void> => {
          guards++;
        },
      };
    }
    const results = await Promise.all(
      inputs.map((input) => ctx.entityService.applyEntityMutationOnce(input)),
    );
    expect(results[0]).toEqual(results[1]);
    expect(validations).toBe(2);
    expect(guards).toBe(1);
    expect((await client.execute("SELECT * FROM entities")).rows).toHaveLength(
      1,
    );
    expect(events).toHaveLength(1);
  });

  test("a terminal decision committed during validation fences off the late write", async () => {
    const started = Promise.withResolvers<void>();
    const resume = Promise.withResolvers<void>();
    ctx.entityRegistry.registerPersistValidator("test", async () => {
      started.resolve();
      await resume.promise;
    });
    const pending = ctx.entityService.applyEntityMutationOnce(creation());
    await started.promise;
    await ctx.entityService.applyEntityMutationOnce({
      receipt: key,
      operation: "none",
    });
    const terminal = await state();
    resume.resolve();
    expect(await pending).toEqual({ operation: "none" });
    expect(await state()).toEqual(terminal);
    expect(events).toHaveLength(0);
  });

  test("returned receipts are detached", async () => {
    const result = await ctx.entityService.applyEntityMutationOnce(creation());
    if (result.operation === "none")
      throw new Error("Expected created receipt");
    result.entityId = "changed";
    expect(await ctx.entityService.getEntityMutationReceipt(key)).toMatchObject(
      { entityId: "target" },
    );
  });
});
