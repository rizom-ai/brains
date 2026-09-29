import {
  afterEach,
  beforeEach,
  describe,
  expect,
  mock,
  spyOn,
  test,
} from "bun:test";
import type { InValue } from "@libsql/client";
import { sql } from "drizzle-orm";
import type { SQLiteTransactionConfig } from "drizzle-orm/sqlite-core";
import type { EntityDB } from "../src/db";
import type { EntityTransaction } from "../src/projection-transaction-runner";
import { entities } from "../src/schema/entities";
import { computeContentHash } from "@brains/utils/hash";
import { z } from "@brains/utils/zod";
import { createSilentLogger } from "@brains/test-utils";
import { EntityService } from "../src/entityService";
import { EntityRegistry } from "../src/entityRegistry";
import { reprojectGroupings } from "../src/grouping-reprojection";
import { mockEmbeddingService } from "./helpers/mock-services";
import {
  minimalTestAdapter,
  minimalTestSchema,
  strictAdapter,
  strictSchema,
} from "./helpers/test-schemas";
import {
  setupEntityService,
  type EntityServiceTestContext,
} from "./helpers/setup-entity-service";

const grouping = {
  key: "clients",
  label: "Clients",
  field: "clients",
  types: ["test"],
};
const query = { grouping: "clients", entityTypes: ["test"] };
const content = (value: string): string =>
  `---\nclients: ${value}\n---\n\nBody`;

describe("grouping startup reprojection", () => {
  let ctx: EntityServiceTestContext;
  let db: EntityDB;
  let beforePage: Array<() => Promise<unknown>>;
  let refusePage: boolean;

  async function readRows(
    statement: string,
    args: InValue[] = [],
  ): Promise<Record<string, unknown>[]> {
    const result = await db.$client.execute({ sql: statement, args });
    return result.rows.map((row) =>
      Object.fromEntries(result.columns.map((column) => [column, row[column]])),
    );
  }
  async function readRow(
    statement: string,
  ): Promise<Record<string, unknown> | undefined> {
    return (await readRows(statement))[0];
  }
  async function attachOwner(): Promise<void> {
    db = await ctx.entityService
      .getProjectionStore()
      .runDatabaseOperation(async (database) => database);
    const original = db.transaction.bind(db);
    spyOn(db, "transaction").mockImplementation(
      async <T>(
        body: (transaction: EntityTransaction) => Promise<T>,
        config?: SQLiteTransactionConfig,
      ): Promise<T> => {
        // Deterministic competing writes after page preparation, before its
        // transaction begins. Every write uses the same native owner and is joined.
        for (const write of beforePage.splice(0)) await write();
        return original(async (transaction) => {
          const result = await body(transaction);
          if (refusePage)
            await transaction.run(sql`SELECT * FROM projection_refused`);
          return result;
        }, config);
      },
    );
  }
  const send = mock(async () => undefined);
  beforeEach(async () => {
    send.mockClear();
    beforePage = [];
    refusePage = false;
    ctx = await setupEntityService(
      [
        {
          name: "test",
          schema: minimalTestSchema,
          adapter: minimalTestAdapter,
        },
        { name: "strict", schema: strictSchema, adapter: strictAdapter },
      ],
      { embeddingsEnabled: false, messageBus: { send } },
    );
    await ctx.entityService.initialize();
    await attachOwner();
  });
  afterEach(async () => {
    await ctx.entityService.closeAsync();
    await ctx.cleanup();
  });
  async function seed(id: string, value = "[Acme]"): Promise<void> {
    await ctx.entityService.createEntity({
      entity: {
        id,
        entityType: "test",
        content: content(value),
        metadata: { unrelated: "keep" },
      },
    });
  }
  async function restart(groupingEnabled: boolean): Promise<void> {
    await ctx.entityService.closeAsync();
    ctx.entityRegistry = EntityRegistry.createFresh(createSilentLogger());
    ctx.entityRegistry.registerEntityType(
      "test",
      minimalTestSchema,
      minimalTestAdapter,
    );
    if (groupingEnabled) ctx.entityRegistry.registerGrouping(grouping);
    ctx.entityService = EntityService.createFresh({
      entityRegistry: ctx.entityRegistry,
      embeddingService: mockEmbeddingService,
      embeddingsEnabled: false,
      logger: createSilentLogger(),
      jobQueueService: ctx.jobQueueService,
      dbConfig: ctx.dbConfig,
    });
    await ctx.entityService.initialize();
    await attachOwner();
  }
  test("reprojects after a register-only write while the grouping was disabled", async () => {
    await seed("first");
    ctx.entityRegistry.registerGrouping(grouping);
    await ctx.entityService.reprojectRegisteredGroupings();
    await restart(false);
    await seed("later", "[Beta]");
    await restart(true);
    await ctx.entityService.reprojectRegisteredGroupings();
    expect(ctx.entityService.areGroupingsReady()).toBe(true);
    expect(
      (await ctx.entityService.queryGroupingCatalog(query)).values,
    ).toEqual([
      { value: "Acme", count: 1 },
      { value: "Beta", count: 1 },
    ]);
  });
  test("revalidates changed field constraints even when declarations are identical", async () => {
    await seed("entry");
    ctx.entityRegistry.registerGrouping(grouping);
    await ctx.entityService.reprojectRegisteredGroupings();
    await restart(false);
    ctx.entityRegistry.extendFrontmatterSchema(
      "test",
      z.object({ clients: z.array(z.string()).min(2).optional() }),
    );
    ctx.entityRegistry.registerGrouping(grouping);
    await ctx.entityService.reprojectRegisteredGroupings();
    expect(
      (await ctx.entityService.queryGroupingCatalog(query)).values,
    ).toEqual([]);
    expect(
      await readRow("SELECT content FROM entities WHERE id = 'entry'"),
    ).toEqual({ content: content("[Acme]") });
  });
  test("discovers existing source without saves, timestamps, events, or export work", async () => {
    await seed("legacy\u0000id");
    await seed("\ufeffid", "[Beta]");
    const before = await readRows(
      "SELECT id, content, contentHash, created, updated, visibility FROM entities ORDER BY id",
    );
    const exportsBefore = await readRows(
      "SELECT * FROM entity_export_intents ORDER BY entity_id",
    );
    send.mockClear();
    ctx.entityRegistry.registerGrouping(grouping);
    expect(ctx.entityService.areGroupingsReady()).toBe(false);
    expect((await ctx.entityService.queryGroupingCatalog(query)).total).toBe(0);
    await ctx.entityService.reprojectRegisteredGroupings();
    expect(ctx.entityService.areGroupingsReady()).toBe(true);
    expect(
      (await ctx.entityService.queryGroupingCatalog(query)).values,
    ).toEqual([
      { value: "Acme", count: 1 },
      { value: "Beta", count: 1 },
    ]);
    expect(
      await readRows(
        "SELECT id, content, contentHash, created, updated, visibility FROM entities ORDER BY id",
      ),
    ).toEqual(before);
    expect(
      await readRows("SELECT * FROM entity_export_intents ORDER BY entity_id"),
    ).toEqual(exportsBefore);
    expect(send).not.toHaveBeenCalled();
    const all = await readRows("SELECT metadata FROM entities ORDER BY id");
    expect(all).toEqual([
      { metadata: JSON.stringify({ unrelated: "keep", clients: ["Acme"] }) },
      { metadata: JSON.stringify({ unrelated: "keep", clients: ["Beta"] }) },
    ]);
    // Repeated passes validate source again, but remain write/event-idempotent.
    const updated = spyOn(ctx.entityRegistry, "projectStoredMetadata");
    await ctx.entityService.reprojectRegisteredGroupings();
    expect(updated).toHaveBeenCalled();
    expect(ctx.entityService.areGroupingsReady()).toBe(true);
    expect(await readRows("SELECT metadata FROM entities ORDER BY id")).toEqual(
      all,
    );
    expect(send).not.toHaveBeenCalled();
  });
  test("rescans and converges when the declaration set changes", async () => {
    await seed("entry");
    ctx.entityRegistry.registerGrouping(grouping);
    await ctx.entityService.reprojectRegisteredGroupings();
    const projected = spyOn(ctx.entityRegistry, "projectStoredMetadata");
    // Adding a contributor is picked up by the next bounded pass.
    ctx.entityRegistry.registerGrouping({
      key: "projects",
      label: "Projects",
      field: "projects",
      types: ["test"],
    });
    await ctx.entityService.reprojectRegisteredGroupings();
    expect(projected).toHaveBeenCalled();
    expect(
      (await ctx.entityService.queryGroupingCatalog(query)).values,
    ).toEqual([{ value: "Acme", count: 1 }]);
  });
  test("repeats the pass when an earlier one never completed", async () => {
    await seed("entry");
    ctx.entityRegistry.registerGrouping(grouping);
    const failing = spyOn(
      ctx.entityRegistry,
      "projectStoredMetadata",
    ).mockImplementation(() => {
      throw new Error("boom");
    });
    const failure = await ctx.entityService.reprojectRegisteredGroupings().then(
      () => null,
      (error: Error) => error,
    );
    expect(failure?.message).toBe("boom");
    expect(ctx.entityService.areGroupingsReady()).toBe(false);
    failing.mockRestore();
    const retried = spyOn(ctx.entityRegistry, "projectStoredMetadata");
    await ctx.entityService.reprojectRegisteredGroupings();
    expect(retried).toHaveBeenCalled();
    expect(ctx.entityService.areGroupingsReady()).toBe(true);
  });
  test("discovers membership on rows whose unrelated frontmatter is invalid", async () => {
    // Canonical content carries invalid-status rows; they are still members.
    await ctx.entityService.createEntity({
      entity: {
        id: "bad-status",
        entityType: "strict",
        content: `---\nstatus: bogus\nclients:\n  - Acme\n---\n\nBody`,
        metadata: {},
      },
    });
    ctx.entityRegistry.registerGrouping({ ...grouping, types: ["strict"] });
    await ctx.entityService.reprojectRegisteredGroupings();
    expect(
      (
        await ctx.entityService.queryGroupingCatalog({
          grouping: "clients",
          entityTypes: ["strict"],
        })
      ).values,
    ).toEqual([{ value: "Acme", count: 1 }]);
    expect(
      await readRow("SELECT content FROM entities WHERE id = 'bad-status'"),
    ).toEqual({
      content: `---\nstatus: bogus\nclients:\n  - Acme\n---\n\nBody`,
    });
  });
  test("removes stale projections and preserves malformed authored values", async () => {
    for (const [index, value] of ["Acme", "null", "[]", "[Acme, 3]"].entries())
      await seed(String(index), value);
    await readRows("UPDATE entities SET metadata = ?", [
      JSON.stringify({ clients: ["Stale"], unrelated: "keep" }),
    ]);
    const before = await readRows("SELECT content FROM entities ORDER BY id");
    ctx.entityRegistry.registerGrouping(grouping);
    await ctx.entityService.reprojectRegisteredGroupings();
    expect((await ctx.entityService.queryGroupingCatalog(query)).total).toBe(0);
    expect(await readRows("SELECT content FROM entities ORDER BY id")).toEqual(
      before,
    );
    expect(
      await readRow("SELECT metadata FROM entities WHERE id = '0'"),
    ).toEqual({ metadata: JSON.stringify({ unrelated: "keep" }) });
  });
  test("retries a fresh source revision rather than overwriting a concurrent writer", async () => {
    await seed("entry");
    ctx.entityRegistry.registerGrouping(grouping);
    const original = ctx.entityRegistry.projectStoredMetadata.bind(
      ctx.entityRegistry,
    );
    let writes = 0;
    spyOn(ctx.entityRegistry, "projectStoredMetadata").mockImplementation(
      (...args) => {
        if (writes++ === 0) {
          const changed = content("[Beta]");
          beforePage.push(() =>
            readRows(
              "UPDATE entities SET content = ?, contentHash = ?, metadata = ? WHERE id = 'entry'",
              [
                changed,
                computeContentHash(changed),
                JSON.stringify({ clients: ["Beta"], unrelated: "new" }),
              ],
            ),
          );
        }
        return original(...args);
      },
    );
    await ctx.entityService.reprojectRegisteredGroupings();
    expect(writes).toBeGreaterThan(1);
    expect(
      (await ctx.entityService.queryGroupingCatalog(query)).values,
    ).toEqual([{ value: "Beta", count: 1 }]);
    expect(await readRow("SELECT metadata FROM entities")).toEqual({
      metadata: JSON.stringify({ clients: ["Beta"], unrelated: "new" }),
    });
  });
  test("never recreates a row deleted after it was read", async () => {
    await seed("entry");
    ctx.entityRegistry.registerGrouping(grouping);
    const original = ctx.entityRegistry.projectStoredMetadata.bind(
      ctx.entityRegistry,
    );
    spyOn(ctx.entityRegistry, "projectStoredMetadata").mockImplementation(
      (...args) => {
        beforePage.push(() =>
          readRows("DELETE FROM entities WHERE id = 'entry'"),
        );
        return original(...args);
      },
    );
    await ctx.entityService.reprojectRegisteredGroupings();
    expect(await readRows("SELECT id FROM entities")).toEqual([]);
  });
  test("rechecks every prepared row and preserves unchanged-hash edits and sibling deletions", async () => {
    await seed("a");
    await seed("b");
    await seed("c");
    ctx.entityRegistry.registerGrouping(grouping);
    const original = ctx.entityRegistry.projectStoredMetadata.bind(
      ctx.entityRegistry,
    );
    let projections = 0;
    spyOn(ctx.entityRegistry, "projectStoredMetadata").mockImplementation(
      (...args) => {
        if (++projections === 2) {
          // The first row is already prepared, but neither its hash nor its
          // metadata reveals this out-of-band source edit.
          beforePage.push(() =>
            readRows("UPDATE entities SET content = ? WHERE id = 'a'", [
              content("[Beta]"),
            ]),
          );
          beforePage.push(() =>
            readRows("DELETE FROM entities WHERE id = 'b'"),
          );
        }
        return original(...args);
      },
    );
    await ctx.entityService.reprojectRegisteredGroupings();
    expect(ctx.entityService.areGroupingsReady()).toBe(true);
    expect(await readRows("SELECT id FROM entities ORDER BY id")).toEqual([
      { id: "a" },
      { id: "c" },
    ]);
    expect(
      (await ctx.entityService.queryGroupingCatalog(query)).values,
    ).toEqual([
      { value: "Acme", count: 1 },
      { value: "Beta", count: 1 },
    ]);
  });

  test("a targeted pass touches only requested declared type/field pairs", async () => {
    await ctx.entityService.createEntity({
      entity: {
        id: "entry",
        entityType: "test",
        content: "---\nclients: [Acme]\nareas: [Research]\n---\nBody",
        metadata: { unrelated: "keep" },
      },
    });
    await ctx.entityService.createEntity({
      entity: {
        id: "other",
        entityType: "strict",
        content: "---\nstatus: draft\nclients: [Beta]\n---\nBody",
        metadata: {},
      },
    });
    ctx.entityRegistry.replaceGroupings([
      { ...grouping, types: ["test", "strict"] },
      { key: "areas", field: "areas", label: "Areas", types: ["test"] },
    ]);
    const original = await readRows(
      "SELECT id, metadata FROM entities ORDER BY id",
    );
    const projected = spyOn(ctx.entityRegistry, "projectStoredMetadata");
    await reprojectGroupings(db, ctx.entityRegistry, [
      { entityType: "test", field: "areas" },
    ]);
    expect(projected.mock.calls.map((call) => call[0])).toEqual(["test"]);
    expect(
      await readRow("SELECT metadata FROM entities WHERE id = 'entry'"),
    ).toEqual({
      metadata: JSON.stringify({ unrelated: "keep", areas: ["Research"] }),
    });
    expect(
      await readRow("SELECT id, metadata FROM entities WHERE id = 'other'"),
    ).toEqual(original[1]);
    projected.mockClear();
    await reprojectGroupings(db, ctx.entityRegistry, [
      { entityType: "test", field: "undeclared" },
    ]);
    expect(projected).not.toHaveBeenCalled();
  });

  test("a field removed while a page is prepared is not erased from stored metadata", async () => {
    await seed("entry");
    await readRows("UPDATE entities SET metadata = ? WHERE id = 'entry'", [
      JSON.stringify({ clients: ["Old"], unrelated: "keep" }),
    ]);
    const before = await readRows("SELECT content, metadata FROM entities");
    ctx.entityRegistry.registerGrouping(grouping);
    const original = ctx.entityRegistry.projectStoredMetadata.bind(
      ctx.entityRegistry,
    );
    spyOn(ctx.entityRegistry, "projectStoredMetadata").mockImplementation(
      (...args) => {
        ctx.entityRegistry.replaceGroupings([]);
        return original(...args);
      },
    );
    await ctx.entityService.reprojectRegisteredGroupings();
    expect(await readRows("SELECT content, metadata FROM entities")).toEqual(
      before,
    );
  });

  test("cancellation before a prepared page commits leaves all rows unchanged", async () => {
    await seed("a");
    await seed("b");
    const before = await readRows("SELECT metadata FROM entities ORDER BY id");
    ctx.entityRegistry.registerGrouping(grouping);
    const controller = new AbortController();
    const original = ctx.entityRegistry.projectStoredMetadata.bind(
      ctx.entityRegistry,
    );
    spyOn(ctx.entityRegistry, "projectStoredMetadata").mockImplementation(
      (...args) => {
        controller.abort(new Error("Stopped"));
        return original(...args);
      },
    );
    expect(
      await reprojectGroupings(
        db,
        ctx.entityRegistry,
        undefined,
        controller.signal,
      ).catch((error: unknown) => error),
    ).toMatchObject({ message: "Stopped" });
    expect(await readRows("SELECT metadata FROM entities ORDER BY id")).toEqual(
      before,
    );
  });

  test("commits bounded pages rather than one transaction per entity", async () => {
    const source = content("[Acme]");
    await db.transaction(async (transaction) => {
      for (let offset = 0; offset < 401; offset += 16) {
        await transaction.insert(entities).values(
          Array.from({ length: Math.min(16, 401 - offset) }, (_, index) => ({
            id: String(offset + index).padStart(4, "0"),
            entityType: "test",
            content: source,
            contentHash: computeContentHash(source),
            metadata: {},
            visibility: "public" as const,
            created: 0,
            updated: 0,
          })),
        );
      }
    });
    ctx.entityRegistry.registerGrouping(grouping);
    const transactions = spyOn(db, "transaction");
    transactions.mockClear();
    await reprojectGroupings(db, ctx.entityRegistry);
    expect(transactions).toHaveBeenCalledTimes(3);
    expect(
      await readRow(
        "SELECT count(*) AS count FROM entities WHERE json_extract(metadata, '$.clients[0]') = 'Acme'",
      ),
    ).toEqual({ count: 401 });
    transactions.mockClear();
    await reprojectGroupings(db, ctx.entityRegistry);
    expect(transactions).not.toHaveBeenCalled();
  });

  test("rolls back a failed page and leaves startup retryable", async () => {
    await seed("a");
    await seed("b");
    const before = await readRows(
      "SELECT id, metadata FROM entities ORDER BY id",
    );
    ctx.entityRegistry.registerGrouping(grouping);
    refusePage = true;
    const failure = await ctx.entityService
      .reprojectRegisteredGroupings()
      .catch((cause: unknown) => cause);
    expect(failure).toBeInstanceOf(Error);
    expect(failure).toMatchObject({
      message: expect.stringContaining("Failed query"),
    });
    expect(ctx.entityService.areGroupingsReady()).toBe(false);
    expect(
      await readRows("SELECT id, metadata FROM entities ORDER BY id"),
    ).toEqual(before);
    refusePage = false;
    await ctx.entityService.reprojectRegisteredGroupings();
    expect(ctx.entityService.areGroupingsReady()).toBe(true);
    expect(
      (await ctx.entityService.queryGroupingCatalog(query)).values,
    ).toEqual([{ value: "Acme", count: 2 }]);
  });

  test("bounded conflict exhaustion leaves reads unready", async () => {
    await seed("entry");
    ctx.entityRegistry.registerGrouping(grouping);
    const original = ctx.entityRegistry.projectStoredMetadata.bind(
      ctx.entityRegistry,
    );
    let writes = 0;
    spyOn(ctx.entityRegistry, "projectStoredMetadata").mockImplementation(
      (...args) => {
        const changed = content(`[Revision-${++writes}]`);
        beforePage.push(() =>
          readRows(
            "UPDATE entities SET content = ?, contentHash = ? WHERE id = 'entry'",
            [changed, computeContentHash(changed)],
          ),
        );
        return original(...args);
      },
    );
    const error = await ctx.entityService
      .reprojectRegisteredGroupings()
      .catch((cause: unknown) => cause);
    expect(error).toBeInstanceOf(Error);
    expect(writes).toBeLessThanOrEqual(5);
    expect(ctx.entityService.areGroupingsReady()).toBe(false);
  });
});
