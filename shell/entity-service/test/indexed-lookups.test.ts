import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { createClient, type Client } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { createSilentLogger } from "@brains/test-utils";
import { z } from "@brains/utils/zod";
import { EntityQueries } from "../src/entity-queries";
import { EntitySearch } from "../src/entity-search";
import { EntitySerializer } from "../src/entity-serializer";
import {
  attachEmbeddingDatabase,
  createEmbeddingDatabase,
  dbUrlToPath,
} from "../src/db/embedding-db";
import { MOCK_DIMENSIONS, mockEmbeddingService } from "./helpers/mock-services";
import {
  minimalTestAdapter,
  minimalTestSchema,
  postAdapter,
  postSchema,
} from "./helpers/test-schemas";
import { createTestEntity } from "../src/test/index";
import {
  setupEntityService,
  type EntityServiceTestContext,
} from "./helpers/setup-entity-service";

/**
 * A site build looks entities up by slug and by type once for every page, so
 * neither lookup may scan the entities table: a scan per page makes a build
 * grow with the square of the brain's size.
 */
describe("indexed entity lookups", () => {
  let ctx: EntityServiceTestContext;
  let client: Client;
  const statements: Array<{ sql: string; params: unknown[] }> = [];

  beforeEach(async () => {
    ctx = await setupEntityService([
      { name: "post", schema: postSchema, adapter: postAdapter },
      { name: "test", schema: minimalTestSchema, adapter: minimalTestAdapter },
    ]);
    await ctx.entityService.initialize();
    client = createClient({ url: ctx.dbConfig.url });
    statements.length = 0;
  });

  afterEach(async () => {
    client.close();
    await ctx.cleanup();
  });

  function loggingDb(): ReturnType<typeof drizzle> {
    return drizzle(client, {
      logger: {
        logQuery: (sql, params): void => {
          statements.push({ sql, params });
        },
      },
    });
  }

  /** Explain the exact executed SQL, not a hand-maintained approximation. */
  async function plansOf(
    matching: (sql: string) => boolean = (): boolean => true,
  ): Promise<string[]> {
    return Promise.all(
      statements
        .filter((statement) => matching(statement.sql))
        .map(async (statement) => {
          const plan = await client.execute({
            sql: `EXPLAIN QUERY PLAN ${statement.sql}`,
            args: z
              .array(z.union([z.string(), z.number(), z.null()]))
              .parse(statement.params),
          });
          return plan.rows.map((row) => String(row["detail"])).join("; ");
        }),
    );
  }

  function queries(): EntityQueries {
    const embedding = createEmbeddingDatabase(ctx.embeddingDbConfig);
    return new EntityQueries({
      db: loggingDb(),
      embeddingDb: embedding.db,
      entityRegistry: ctx.entityRegistry,
      logger: createSilentLogger(),
      serializer: new EntitySerializer(
        ctx.entityRegistry,
        createSilentLogger(),
      ),
    });
  }

  test("finds an entity by its slug without scanning", async () => {
    await queries().listEntities("post", {
      filter: { metadata: { slug: "erstes/2" } },
      limit: 1,
    });

    const [plan] = await plansOf();
    expect(plan).toContain("USING INDEX entities_type_slug_idx");
    expect(plan).not.toContain("SCAN entities");
  });

  test("finds the nearest entities of a type without scanning", async () => {
    await attachEmbeddingDatabase(
      client,
      dbUrlToPath(ctx.embeddingDbConfig.url),
    );
    const origin = createTestEntity("test", { id: "origin" });
    await ctx.entityService.createEntity({ entity: origin });
    await ctx.entityService.storeEmbedding({
      entityId: origin.id,
      entityType: "test",
      embedding: new Float32Array(MOCK_DIMENSIONS),
      contentHash: origin.contentHash,
    });
    const search = new EntitySearch(
      loggingDb(),
      mockEmbeddingService,
      new EntitySerializer(ctx.entityRegistry, createSilentLogger()),
      createSilentLogger(),
    );

    await search.nearestToEntity({
      origin: { entityType: "test", entityId: "origin" },
      types: ["topic"],
      limit: 3,
    });

    const [plan] = await plansOf((sql) => sql.includes("vector_distance_cos"));
    expect(plan).toContain("USING INDEX entities_type_slug_idx");
    expect(plan).not.toContain("SCAN entities");
    // Only the embeddings of the entities found are read, never all of them.
    expect(plan).not.toContain("SCAN emb_e");
  });
});

describe("metadata filter keys", () => {
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

  test("filters by a nested field", async () => {
    expect(
      await ctx.entityService.listEntities({
        entityType: "post",
        options: { filter: { metadata: { "author.name": "Erfunden" } } },
      }),
    ).toEqual([]);
  });

  test("refuses a key that is not a field name", async () => {
    expect(
      ctx.entityService.listEntities({
        entityType: "post",
        options: { filter: { metadata: { "slug') OR ('1": "x" } } },
      }),
    ).rejects.toThrow("Invalid metadata filter key");
  });
});
