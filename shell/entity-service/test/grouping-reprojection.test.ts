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
import { fileURLToPath } from "node:url";
import { computeContentHash } from "@brains/utils/hash";
import { minimalTestAdapter, minimalTestSchema } from "./helpers/test-schemas";
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
    const updated = spyOn(ctx.entityRegistry, "projectMetadata");
    await ctx.entityService.reprojectRegisteredGroupings();
    expect(updated).toHaveBeenCalled();
    expect(db.query("SELECT metadata FROM entities ORDER BY id").all()).toEqual(
      all,
    );
    expect(send).not.toHaveBeenCalled();
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
    const original = ctx.entityRegistry.projectMetadata.bind(
      ctx.entityRegistry,
    );
    let writes = 0;
    spyOn(ctx.entityRegistry, "projectMetadata").mockImplementation(
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
    const original = ctx.entityRegistry.projectMetadata.bind(
      ctx.entityRegistry,
    );
    spyOn(ctx.entityRegistry, "projectMetadata").mockImplementation(
      (...args) => {
        db.run("DELETE FROM entities WHERE id = 'entry'");
        return original(...args);
      },
    );
    await ctx.entityService.reprojectRegisteredGroupings();
    expect(db.query("SELECT id FROM entities").all()).toEqual([]);
  });
  test("bounded conflict exhaustion leaves reads unready", async () => {
    await seed("entry");
    ctx.entityRegistry.registerGrouping(grouping);
    const original = ctx.entityRegistry.projectMetadata.bind(
      ctx.entityRegistry,
    );
    let writes = 0;
    spyOn(ctx.entityRegistry, "projectMetadata").mockImplementation(
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
