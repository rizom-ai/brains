// Source-only consumer proof. Small assets exercise SQL/mapping, NOT bulk isolation.
import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { cp, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { eq } from "drizzle-orm";
import { migrate } from "drizzle-orm/libsql/migrator";
import { prepareAsset } from "@brains/assets";
import { createSilentLogger } from "@brains/test-utils";
import {
  normalizeSearchText,
  type EntityDB,
} from "../shell/entity-service/src/db";
import { EntityQueries } from "../shell/entity-service/src/entity-queries";
import {
  EntitySearch,
  type QueryEmbedder,
} from "../shell/entity-service/src/entity-search";
import { EntityRegistry } from "../shell/entity-service/src/entityRegistry";
import { EntitySerializer } from "../shell/entity-service/src/entity-serializer";
import { SqliteAssetRepository } from "../shell/entity-service/src/sqlite-asset-repository";
import {
  entities,
  type InsertEntity,
} from "../shell/entity-service/src/schema/entities";
import { embeddings } from "../shell/entity-service/src/schema/embeddings";
import { assets } from "../shell/entity-service/src/schema/assets";
import {
  noteSchema,
  noteAdapter,
  postSchema,
  postAdapter,
} from "../shell/entity-service/test/helpers/test-schemas";
import { SqlWorkerDriver } from "../shared/db/src/turso-worker/client";
import { createWorkerDatabase } from "../shared/db/src/turso-worker/binary-transaction";

const workerUrl = new URL(
  "../shared/db/src/turso-worker/worker.ts",
  import.meta.url,
);
const drivers: SqlWorkerDriver[] = [];
let folder: string;
interface Fixture {
  driver: SqlWorkerDriver;
  db: EntityDB;
  queries: EntityQueries;
  assets: SqliteAssetRepository;
  search: (
    enabled: boolean,
    embedder?: QueryEmbedder,
    excluded?: () => string[],
  ) => EntitySearch;
}
async function open(path: string, initialize = true): Promise<Fixture> {
  const driver = new SqlWorkerDriver({
    url: pathToFileURL(path).href,
    workerUrl,
  });
  drivers.push(driver);
  const db = createWorkerDatabase<Record<string, unknown>>(driver, {
    entities,
    embeddings,
    assets,
  });
  if (initialize)
    await migrate(db, {
      migrationsFolder: fileURLToPath(
        new URL("../shell/entity-service/drizzle", import.meta.url),
      ),
    });
  const logger = createSilentLogger();
  const registry = EntityRegistry.createFresh(logger);
  registry.registerEntityType("note", noteSchema, noteAdapter);
  registry.registerEntityType("post", postSchema, postAdapter);
  const serializer = new EntitySerializer(registry, logger);
  const forbidden: QueryEmbedder = {
    generateEmbedding: async () => {
      throw new Error("Lexical search must not call an embedding provider");
    },
  };
  return {
    driver,
    db,
    queries: new EntityQueries({ db, serializer, logger }),
    assets: new SqliteAssetRepository(db, { now: () => 1000 }),
    search: (enabled, embedder = forbidden, excluded) =>
      new EntitySearch(db, embedder, serializer, logger, enabled, excluded),
  };
}
beforeEach(async () => {
  folder = await mkdtemp(join(tmpdir(), "brains-thread-entities-"));
});
afterEach(async () => {
  const results = await Promise.allSettled(
    drivers.splice(0).map((driver) => driver.close()),
  );
  const errors = results.flatMap((result) =>
    result.status === "rejected" ? [result.reason] : [],
  );
  try {
    await rm(folder, { recursive: true, force: true });
  } catch (error) {
    errors.push(error);
  }
  if (errors.length)
    throw new AggregateError(errors, "Entity proof cleanup failed");
});
function row(
  id: string,
  entityType = "note",
  overrides: Partial<InsertEntity> = {},
): InsertEntity {
  const content = overrides.content ?? "stellar 你好 COMMIT; BEGIN";
  return {
    id,
    entityType,
    content,
    contentHash: createHash("sha256").update(content).digest("hex"),
    searchText: normalizeSearchText(content),
    visibility: "public",
    metadata: {},
    created: 1000,
    updated: 1000,
    ...overrides,
  };
}
function vector(axis: number): Float32Array {
  const value = new Float32Array(1536);
  value[axis] = 1;
  return value;
}

describe("real entity queries on the isolated Turso thread", () => {
  it("preserves visibility, JSON filtering/sorting and parameterized lexical weighting", async () => {
    const { db, queries, search } = await open(join(folder, "lexical.db"));
    await db.insert(entities).values([
      row("same"),
      row("same", "post", {
        metadata: {
          status: "published",
          category: "science",
          publishedAt: "2026-01-02",
        },
      }),
      row("older", "post", {
        metadata: {
          status: "published",
          category: "science",
          publishedAt: "2026-01-01",
        },
      }),
      row("hidden", "note", { visibility: "restricted" }),
      row("shared", "note", { visibility: "shared" }),
      row("failed", "note", { metadata: { status: "failed" } }),
    ]);
    expect(await queries.getEntityData("note", "hidden")).toBeNull();
    expect(
      (await queries.getEntityData("note", "hidden", "restricted"))?.id,
    ).toBe("hidden");
    expect(
      await queries.countEntities("post", {
        publishedOnly: true,
        filter: { metadata: { category: "science" } },
      }),
    ).toBe(2);
    expect(
      (
        await queries.listEntities("post", {
          publishedOnly: true,
          sortFields: [{ field: "publishedAt", direction: "desc" }],
          limit: 1,
          offset: 1,
        })
      ).map((entity) => entity.id),
    ).toEqual(["older"]);
    const lexical = search(false);
    const found = await lexical.search("ＳＴＥＬＬＡＲ", {
      weight: { post: 3, "x'); COMMIT; --": 100 },
    });
    expect(
      found.map((result) => `${result.entity.entityType}:${result.entity.id}`),
    ).toEqual(["post:older", "post:same", "note:same"]);
    expect(found[0]?.score).toBe(3);
    expect(
      (
        await lexical.search("stellar", {
          visibilityScope: "shared",
          types: ["note"],
        })
      )
        .map((result) => result.entity.id)
        .sort(),
    ).toEqual(["same", "shared"]);
    expect(
      (
        await lexical.search("stellar", {
          visibilityScope: "restricted",
          includeUngenerated: true,
        })
      ).length,
    ).toBe(6);
    expect(
      (await search(false, undefined, () => ["post"]).search("stellar")).map(
        (result) => result.entity.entityType,
      ),
    ).toEqual(["note"]);
    expect(await queries.entityExists("note", "same")).toBe(true);
    expect(await queries.entityExists("post", "same")).toBe(true);
  });

  it("runs native vector32/cosine hybrid joins and maps vector BLOBs without conflating composite IDs", async () => {
    const { db, queries, search } = await open(join(folder, "vectors.db"));
    await db
      .insert(entities)
      .values([row("same"), row("same", "post"), row("lexical")]);
    const x = vector(0);
    const y = vector(1);
    await db.insert(embeddings).values([
      {
        entityId: "same",
        entityType: "note",
        embedding: x,
        contentHash: row("same", "note").contentHash,
      },
      {
        entityId: "same",
        entityType: "post",
        embedding: y,
        contentHash: row("same", "post").contentHash,
      },
    ]);
    const calls: string[] = [];
    const semantic = search(true, {
      generateEmbedding: async (query) => {
        calls.push(query);
        return { embedding: x, usage: { tokens: 1 } };
      },
    });
    const nearest = await semantic.search("  not-in-content  ");
    expect(
      nearest.map(
        (result) => `${result.entity.entityType}:${result.entity.id}`,
      ),
    ).toEqual(["note:same"]);
    expect(nearest[0]?.score).toBeCloseTo(0.7);
    const hybrid = await semantic.search("stellar");
    expect(
      hybrid
        .map((result) => `${result.entity.entityType}:${result.entity.id}`)
        .sort(),
    ).toEqual(["note:lexical", "note:same", "post:same"]);
    const distances = await semantic.searchWithDistances("direction");
    expect(distances).toEqual([
      { entityId: "same", entityType: "note", distance: 0 },
      { entityId: "same", entityType: "post", distance: 1 },
    ]);
    expect(calls).toEqual(["not-in-content", "stellar", "direction"]);
    const stored = await db
      .select()
      .from(embeddings)
      .where(eq(embeddings.entityType, "post"));
    expect(stored[0]?.embedding).toEqual(y);
    expect(await queries.deleteEntity("note", "same")).toBe(true);
    expect(await queries.entityExists("post", "same")).toBe(true);
    expect(
      (await semantic.searchWithDistances("direction")).map(
        (result) => result.entityType,
      ),
    ).toEqual(["post"]);
  });

  it("binds and deduplicates small asset references atomically and verifies exact bytes after restore", async () => {
    const path = join(folder, "assets.db");
    const fixture = await open(path);
    const bytes = new Uint8Array([0, 128, 255, 1, 2, 3]);
    const asset = prepareAsset(bytes);
    const staged = fixture.assets.stage(asset);
    const publish = (id: string): Promise<void> =>
      fixture.db.transaction(async (tx) => {
        await fixture.assets.bindEntityContent(tx, asset.ref, staged);
        await tx
          .insert(entities)
          .values(row(id, "note", { content: asset.ref }));
      });
    await Promise.all([publish("a"), publish("b")]);
    expect((await fixture.db.select().from(assets)).length).toBe(1);
    expect(await fixture.assets.stat(asset.ref)).toEqual({
      ref: asset.ref,
      sizeBytes: 6,
    });
    expect(await fixture.assets.read(asset.ref)).toEqual(bytes);
    expect((await fixture.assets.verify(asset.ref)).valid).toBe(true);
    const rejected = prepareAsset(new Uint8Array([9, 8, 7]));
    await assert.rejects(
      fixture.db.transaction(async (tx) => {
        await fixture.assets.bindEntityContent(
          tx,
          rejected.ref,
          fixture.assets.stage(rejected),
        );
        await tx
          .insert(entities)
          .values(row("a", "note", { content: rejected.ref }));
      }),
    );
    expect(await fixture.assets.stat(rejected.ref)).toBeNull();
    await assert.rejects(
      fixture.db.transaction((tx) =>
        fixture.assets.bindEntityContent(tx, rejected.ref),
      ),
      /Asset not found/,
    );
    await fixture.driver.close();
    const restoredPath = join(folder, "restored.db");
    await cp(path, restoredPath, { errorOnExist: true, force: false });
    const restored = await open(restoredPath, false);
    expect(await restored.assets.read(asset.ref)).toEqual(bytes);
    expect((await restored.assets.verify(asset.ref)).valid).toBe(true);
    expect((await restored.queries.getEntityData("note", "a"))?.content).toBe(
      asset.ref,
    );
    expect((await restored.queries.getEntityData("note", "b"))?.content).toBe(
      asset.ref,
    );
  });

  it("rejects a same-size corrupt duplicate instead of publishing a new reference", async () => {
    const {
      db,
      assets: repository,
      queries,
    } = await open(join(folder, "corrupt.db"));
    const asset = prepareAsset(new Uint8Array([0, 1, 2]));
    const staged = repository.stage(asset);
    await db.transaction((tx) =>
      repository.bindEntityContent(tx, asset.ref, staged),
    );
    await db
      .update(assets)
      .set({ bytes: Buffer.from([3, 4, 5]) })
      .where(eq(assets.digest, asset.digest));
    expect((await repository.verify(asset.ref)).valid).toBe(false);
    await assert.rejects(
      db.transaction(async (tx) => {
        await repository.bindEntityContent(tx, asset.ref, staged);
        await tx
          .insert(entities)
          .values(row("must-not-publish", "note", { content: asset.ref }));
      }),
      /stored digest/,
    );
    expect(await queries.entityExists("note", "must-not-publish")).toBe(false);
  });
});
