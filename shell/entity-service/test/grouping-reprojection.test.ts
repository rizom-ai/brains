import {
  afterEach,
  beforeEach,
  describe,
  expect,
  mock,
  spyOn,
  test,
} from "bun:test";
import { Database } from "bun:sqlite";
import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { fileURLToPath } from "node:url";
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
  let db: Database;
  const send = mock(async () => undefined);
  beforeEach(async () => {
    send.mockClear();
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
    db = new Database(fileURLToPath(ctx.dbConfig.url));
  });
  afterEach(async () => {
    db.close();
    ctx.entityService.close();
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
    ctx.entityService.close();
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
      embeddingDbConfig: ctx.embeddingDbConfig,
    });
    await ctx.entityService.initialize();
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
      db.query("SELECT content FROM entities WHERE id = 'entry'").get(),
    ).toEqual({ content: content("[Acme]") });
  });
  test("discovers existing source without saves, timestamps, events, or export work", async () => {
    await seed("legacy\u0000id");
    await seed("\ufeffid", "[Beta]");
    const before = db
      .query(
        "SELECT id, content, contentHash, created, updated, visibility FROM entities ORDER BY id",
      )
      .all();
    const exportsBefore = db
      .query("SELECT * FROM entity_export_intents ORDER BY entity_id")
      .all();
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
      db
        .query(
          "SELECT id, content, contentHash, created, updated, visibility FROM entities ORDER BY id",
        )
        .all(),
    ).toEqual(before);
    expect(
      db.query("SELECT * FROM entity_export_intents ORDER BY entity_id").all(),
    ).toEqual(exportsBefore);
    expect(send).not.toHaveBeenCalled();
    const all = db.query("SELECT metadata FROM entities ORDER BY id").all();
    expect(all).toEqual([
      { metadata: JSON.stringify({ unrelated: "keep", clients: ["Acme"] }) },
      { metadata: JSON.stringify({ unrelated: "keep", clients: ["Beta"] }) },
    ]);
    // Repeated passes validate source again, but remain write/event-idempotent.
    const updated = spyOn(ctx.entityRegistry, "projectStoredMetadata");
    await ctx.entityService.reprojectRegisteredGroupings();
    expect(updated).toHaveBeenCalled();
    expect(ctx.entityService.areGroupingsReady()).toBe(true);
    expect(db.query("SELECT metadata FROM entities ORDER BY id").all()).toEqual(
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
      db.query("SELECT content FROM entities WHERE id = 'bad-status'").get(),
    ).toEqual({
      content: `---\nstatus: bogus\nclients:\n  - Acme\n---\n\nBody`,
    });
  });
  test("removes stale projections and preserves malformed authored values", async () => {
    for (const [index, value] of ["Acme", "null", "[]", "[Acme, 3]"].entries())
      await seed(String(index), value);
    db.run("UPDATE entities SET metadata = ?", [
      JSON.stringify({ clients: ["Stale"], unrelated: "keep" }),
    ]);
    const before = db.query("SELECT content FROM entities ORDER BY id").all();
    ctx.entityRegistry.registerGrouping(grouping);
    await ctx.entityService.reprojectRegisteredGroupings();
    expect((await ctx.entityService.queryGroupingCatalog(query)).total).toBe(0);
    expect(db.query("SELECT content FROM entities ORDER BY id").all()).toEqual(
      before,
    );
    expect(
      db.query("SELECT metadata FROM entities WHERE id = '0'").get(),
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
          db.run(
            "UPDATE entities SET content = ?, contentHash = ?, metadata = ? WHERE id = 'entry'",
            [
              changed,
              computeContentHash(changed),
              JSON.stringify({ clients: ["Beta"], unrelated: "new" }),
            ],
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
    expect(db.query("SELECT metadata FROM entities").get()).toEqual({
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
        db.run("DELETE FROM entities WHERE id = 'entry'");
        return original(...args);
      },
    );
    await ctx.entityService.reprojectRegisteredGroupings();
    expect(db.query("SELECT id FROM entities").all()).toEqual([]);
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
          db.run("UPDATE entities SET content = ? WHERE id = 'a'", [
            content("[Beta]"),
          ]);
          db.run("DELETE FROM entities WHERE id = 'b'");
        }
        return original(...args);
      },
    );
    await ctx.entityService.reprojectRegisteredGroupings();
    expect(ctx.entityService.areGroupingsReady()).toBe(true);
    expect(db.query("SELECT id FROM entities ORDER BY id").all()).toEqual([
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

  test("commits bounded pages rather than one transaction per entity", async () => {
    const source = content("[Acme]");
    const insert = db.prepare(
      "INSERT INTO entities (id, entityType, content, contentHash, metadata, visibility, created, updated) VALUES (?, 'test', ?, ?, '{}', 'public', 0, 0)",
    );
    db.transaction(() => {
      for (let index = 0; index < 401; index++)
        insert.run(
          String(index).padStart(4, "0"),
          source,
          computeContentHash(source),
        );
    })();
    ctx.entityRegistry.registerGrouping(grouping);
    const client = createClient({ url: ctx.dbConfig.url });
    try {
      const connection = drizzle(client);
      const transactions = spyOn(connection, "transaction");
      await reprojectGroupings(connection, ctx.entityRegistry);
      expect(transactions).toHaveBeenCalledTimes(3);
      expect(
        db
          .query(
            "SELECT count(*) AS count FROM entities WHERE json_extract(metadata, '$.clients[0]') = 'Acme'",
          )
          .get(),
      ).toEqual({ count: 401 });
      transactions.mockClear();
      await reprojectGroupings(connection, ctx.entityRegistry);
      expect(transactions).not.toHaveBeenCalled();
    } finally {
      client.close();
    }
  });

  test("rolls back a failed page and leaves startup retryable", async () => {
    await seed("a");
    await seed("b");
    const before = db
      .query("SELECT id, metadata FROM entities ORDER BY id")
      .all();
    ctx.entityRegistry.registerGrouping(grouping);
    db.run(
      "CREATE TRIGGER refuse_projection BEFORE UPDATE OF metadata ON entities WHEN NEW.id = 'b' BEGIN SELECT RAISE(ABORT, 'projection refused'); END",
    );
    const failure = await ctx.entityService
      .reprojectRegisteredGroupings()
      .catch((cause: unknown) => cause);
    expect(failure).toBeInstanceOf(Error);
    expect(failure).toMatchObject({
      message: expect.stringContaining("Failed query"),
    });
    expect(ctx.entityService.areGroupingsReady()).toBe(false);
    expect(
      db.query("SELECT id, metadata FROM entities ORDER BY id").all(),
    ).toEqual(before);
    db.run("DROP TRIGGER refuse_projection");
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
        db.run(
          "UPDATE entities SET content = ?, contentHash = ? WHERE id = 'entry'",
          [changed, computeContentHash(changed)],
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
