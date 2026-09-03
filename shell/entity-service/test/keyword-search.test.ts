import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import {
  setupEntityService,
  type EntityServiceTestContext,
} from "./helpers/setup-entity-service";
import { minimalTestSchema, minimalTestAdapter } from "./helpers/test-schemas";
import { createTestEntity } from "@brains/test-utils";
import { SHELL_CHANNELS } from "@brains/contracts";
import { MOCK_DIMENSIONS } from "./helpers/mock-services";
import {
  buildKeywordMatch,
  createEntityDatabase,
  normalizeSearchText,
} from "../src/db";
import { sql } from "drizzle-orm";

describe("portable keyword search", () => {
  let ctx: EntityServiceTestContext;

  beforeEach(async () => {
    ctx = await setupEntityService([
      { name: "test", schema: minimalTestSchema, adapter: minimalTestAdapter },
    ]);
  });

  afterEach(async () => {
    await ctx.cleanup();
  });

  test("keyword search finds exact term in content", async () => {
    const entity = createTestEntity("test", {
      content: "A deep dive into TypeScript generics and type inference",
    });
    await ctx.entityService.createEntity({ entity: entity });

    // Store embedding so vector search works too
    await ctx.entityService.storeEmbedding({
      entityId: entity.id,
      entityType: "test",
      embedding: new Float32Array(MOCK_DIMENSIONS).fill(0.1),
      contentHash: entity.contentHash,
    });

    const results = await ctx.entityService.search({ query: "TypeScript" });
    expect(results.length).toBeGreaterThan(0);
    expect(results[0]?.entity.id).toBe(entity.id);
  });

  test("lexical search remains available when semantic indexing is disabled", async () => {
    await ctx.cleanup();
    ctx = await setupEntityService(
      [
        {
          name: "test",
          schema: minimalTestSchema,
          adapter: minimalTestAdapter,
        },
      ],
      { embeddingsEnabled: false },
    );
    const entity = createTestEntity("test", {
      content: "Offline quokka field guide",
    });
    await ctx.entityService.createEntity({ entity });

    const results = await ctx.entityService.search({
      query: "quokka",
      options: { types: ["test"] },
    });

    expect(results.map((result) => result.entity.id)).toEqual([entity.id]);
    expect(results[0]?.score).toBeGreaterThanOrEqual(0.5);
    expect(
      ctx.entityService.searchWithDistances({ query: "quokka" }),
    ).rejects.toThrow("Semantic indexing is disabled");
  });

  test("lexical fallback applies minScore on a portable score", async () => {
    await ctx.cleanup();
    ctx = await setupEntityService(
      [
        {
          name: "test",
          schema: minimalTestSchema,
          adapter: minimalTestAdapter,
        },
      ],
      { embeddingsEnabled: false },
    );
    const entity = createTestEntity("test", {
      content: "Normalized wombat scoring notes",
    });
    await ctx.entityService.createEntity({ entity });

    const permissive = await ctx.entityService.search({
      query: "wombat",
      options: { types: ["test"], minScore: 0 },
    });
    expect(permissive.map((result) => result.entity.id)).toEqual([entity.id]);

    // A complete lexical match scores 1 for an unweighted type, so a cutoff
    // above 1 filters it while the default threshold admits it.
    const filtered = await ctx.entityService.search({
      query: "wombat",
      options: { types: ["test"], minScore: 1.001 },
    });
    expect(filtered).toEqual([]);
  });

  test("normalizes unicode case and punctuation-separated query terms", async () => {
    await ctx.cleanup();
    ctx = await setupEntityService(
      [
        {
          name: "test",
          schema: minimalTestSchema,
          adapter: minimalTestAdapter,
          config: { weight: 0.25 },
        },
      ],
      { embeddingsEnabled: false },
    );
    const entity = createTestEntity("test", {
      id: "normalized-search",
      content: "Café notes about Python, programming patterns",
    });
    await ctx.entityService.createEntity({ entity });

    const results = await ctx.entityService.search({
      query: "CAFÉ python programming",
      options: {
        types: ["test"],
        weight: { test: 0.25 },
        minScore: 0.5,
      },
    });
    expect(results.map((result) => result.entity.id)).toEqual([entity.id]);
    expect(results[0]?.score).toBeGreaterThanOrEqual(0.5);
  });

  test("uses deterministic ordering across lexical pages", async () => {
    await ctx.cleanup();
    ctx = await setupEntityService(
      [
        {
          name: "test",
          schema: minimalTestSchema,
          adapter: minimalTestAdapter,
        },
      ],
      { embeddingsEnabled: false },
    );
    for (const id of ["b", "a", "c"]) {
      await ctx.entityService.createEntity({
        entity: createTestEntity("test", {
          id,
          content: "stable pagination term",
          created: "2026-01-01T00:00:00.000Z",
          updated: "2026-01-01T00:00:00.000Z",
        }),
      });
    }

    const first = await ctx.entityService.search({
      query: "stable",
      options: { limit: 2 },
    });
    const second = await ctx.entityService.search({
      query: "stable",
      options: { limit: 2, offset: 2 },
    });
    expect([...first, ...second].map((result) => result.entity.id)).toEqual([
      "a",
      "b",
      "c",
    ]);
  });

  test("disabled semantic indexing registers no handler and queues no backfill", async () => {
    await ctx.cleanup();
    ctx = await setupEntityService(
      [
        {
          name: "test",
          schema: minimalTestSchema,
          adapter: minimalTestAdapter,
        },
      ],
      { embeddingsEnabled: false },
    );
    expect(ctx.jobQueueService.registerHandler).not.toHaveBeenCalledWith(
      SHELL_CHANNELS.embedding,
      expect.anything(),
    );

    const entity = createTestEntity("test", {
      content: "Offline backfill candidate",
    });
    await ctx.entityService.createEntity({ entity });

    expect(await ctx.entityService.backfillMissingEmbeddings()).toEqual({
      queued: 0,
      skipped: 0,
    });
  });

  test("keyword boost follows entity content changes", async () => {
    const entity = createTestEntity("test", {
      content: "Introduction to Python programming",
    });
    await ctx.entityService.createEntity({ entity: entity });
    await ctx.entityService.storeEmbedding({
      entityId: entity.id,
      entityType: "test",
      embedding: new Float32Array(MOCK_DIMENSIONS).fill(0.1),
      contentHash: entity.contentHash,
    });

    // Update content
    await ctx.entityService.updateEntity({
      entity: {
        ...entity,
        content: "Advanced Rust memory management",
      },
    });
    const updated = await ctx.entityService.getEntity({
      entityType: "test",
      id: entity.id,
    });
    if (!updated) throw new Error(`Expected updated entity ${entity.id}`);

    // The changed row remains lexically searchable while its new embedding is
    // still queued; invalidating a stale vector must not hide edited content.
    expect(
      (await ctx.entityService.search({ query: "Rust" })).map(
        (result) => result.entity.id,
      ),
    ).toContain(entity.id);

    await ctx.entityService.storeEmbedding({
      entityId: entity.id,
      entityType: "test",
      embedding: new Float32Array(MOCK_DIMENSIONS).fill(0.2),
      contentHash: updated.contentHash,
    });

    // Old term should not get a keyword boost (lower score)
    const oldResults = await ctx.entityService.search({ query: "Python" });
    const oldScore =
      oldResults.find((r) => r.entity.id === entity.id)?.score ?? 0;

    // New term should get a keyword boost (higher score)
    const newResults = await ctx.entityService.search({ query: "Rust" });
    const newScore =
      newResults.find((r) => r.entity.id === entity.id)?.score ?? 0;

    expect(newScore).toBeGreaterThan(oldScore);
  });

  test("deleted content cannot receive a keyword boost", async () => {
    const entity = createTestEntity("test", {
      content: "Unique keyword: xylophone orchestration techniques",
    });
    await ctx.entityService.createEntity({ entity: entity });
    await ctx.entityService.storeEmbedding({
      entityId: entity.id,
      entityType: "test",
      embedding: new Float32Array(MOCK_DIMENSIONS).fill(0.1),
      contentHash: entity.contentHash,
    });

    await ctx.entityService.deleteEntity({ entityType: "test", id: entity.id });

    const results = await ctx.entityService.search({ query: "xylophone" });
    expect(results).toHaveLength(0);
  });

  test("search treats special characters as literal text", async () => {
    const entity = createTestEntity("test", {
      content: "What topics does this brain cover?",
    });
    await ctx.entityService.createEntity({ entity: entity });
    await ctx.entityService.storeEmbedding({
      entityId: entity.id,
      entityType: "test",
      embedding: new Float32Array(MOCK_DIMENSIONS).fill(0.1),
      contentHash: entity.contentHash,
    });

    // These remain literal input rather than query-language operators.
    const queries = [
      "What topics does this brain cover?",
      "search for something*",
      'query with "quotes" inside',
      "hello OR world",
      "test AND other",
    ];

    for (const q of queries) {
      // Should not throw
      const results = await ctx.entityService.search({ query: q });
      expect(Array.isArray(results)).toBe(true);
    }
  });

  test("search filters results by minimum score", async () => {
    const entity = createTestEntity("test", {
      content: "Relevance threshold search content",
    });
    await ctx.entityService.createEntity({ entity: entity });
    await ctx.entityService.storeEmbedding({
      entityId: entity.id,
      entityType: "test",
      embedding: new Float32Array(MOCK_DIMENSIONS).fill(0.1),
      contentHash: entity.contentHash,
    });

    const baseline = await ctx.entityService.search({ query: "relevance" });
    const score = baseline.find(
      (result) => result.entity.id === entity.id,
    )?.score;
    expect(score).toBeNumber();
    if (score === undefined) throw new Error("Expected search result score");

    const belowCutoff = await ctx.entityService.search({
      query: "relevance",
      options: { minScore: score + 0.001 },
    });
    expect(belowCutoff.find((result) => result.entity.id === entity.id)).toBe(
      undefined,
    );

    const aboveCutoff = await ctx.entityService.search({
      query: "relevance",
      options: { minScore: score - 0.001 },
    });
    expect(
      aboveCutoff.find((result) => result.entity.id === entity.id),
    ).toBeDefined();
  });

  test("search parameterizes caller-provided weight keys", async () => {
    const entity = createTestEntity("test", {
      content: "Weighted search content",
    });
    await ctx.entityService.createEntity({ entity: entity });
    await ctx.entityService.storeEmbedding({
      entityId: entity.id,
      entityType: "test",
      embedding: new Float32Array(MOCK_DIMENSIONS).fill(0.1),
      contentHash: entity.contentHash,
    });

    const results = await ctx.entityService.search({
      query: "weighted",
      options: {
        weight: { "test' THEN 999 ELSE 1 END --": 10 },
      },
    });

    expect(Array.isArray(results)).toBe(true);
  });

  test("keyword search boosts exact matches over semantic similarity", async () => {
    // Entity with exact keyword
    const exact = createTestEntity("test", {
      id: "exact-match",
      content: "TypeScript is a typed superset of JavaScript",
    });
    // Entity that's semantically similar but no exact keyword
    const similar = createTestEntity("test", {
      id: "similar",
      content: "Strongly typed programming languages improve code quality",
    });

    await ctx.entityService.createEntity({ entity: exact });
    await ctx.entityService.createEntity({ entity: similar });

    // Give both similar vector embeddings
    await ctx.entityService.storeEmbedding({
      entityId: "exact-match",
      entityType: "test",
      embedding: new Float32Array(MOCK_DIMENSIONS).fill(0.1),
      contentHash: exact.contentHash,
    });
    await ctx.entityService.storeEmbedding({
      entityId: "similar",
      entityType: "test",
      embedding: new Float32Array(MOCK_DIMENSIONS).fill(0.1),
      contentHash: similar.contentHash,
    });

    const results = await ctx.entityService.search({ query: "TypeScript" });
    expect(results.length).toBe(2);
    // Exact keyword match should rank first
    expect(results[0]?.entity.id).toBe("exact-match");
  });
});

describe("portable keyword engine parity", () => {
  test("returns the same keyword-boost decisions on both engines", async () => {
    const decisions: Record<
      string,
      Array<{ id: string; boosted: number }>
    > = {};

    for (const selectedEngine of ["libsql", "turso"] as const) {
      const previousEngine = process.env["BRAINS_DB_ENGINE"];
      process.env["BRAINS_DB_ENGINE"] = selectedEngine;
      const connection = createEntityDatabase({ url: "file::memory:" });
      if (previousEngine === undefined) {
        delete process.env["BRAINS_DB_ENGINE"];
      } else {
        process.env["BRAINS_DB_ENGINE"] = previousEngine;
      }

      try {
        await connection.client.execute(`
          CREATE TABLE entities (
            id TEXT NOT NULL,
            entityType TEXT NOT NULL,
            content TEXT NOT NULL,
            search_text TEXT,
            PRIMARY KEY (id, entityType)
          )
        `);
        const rows = [
          ["exact", "TypeScript is a typed superset of JavaScript"],
          ["semantic", "Strongly typed languages improve code quality"],
        ] as const;
        for (const [id, content] of rows) {
          await connection.client.execute({
            sql: "INSERT INTO entities (id, entityType, content, search_text) VALUES (?, 'test', ?, ?)",
            args: [id, content, normalizeSearchText(content)],
          });
        }

        const query = "typescript";
        decisions[selectedEngine] = await connection.db.all<{
          id: string;
          boosted: number;
        }>(sql`
          SELECT id,
            CASE WHEN ${buildKeywordMatch(query)} THEN 1 ELSE 0 END AS boosted
          FROM entities
          ORDER BY id
        `);
      } finally {
        connection.client.close();
      }
    }

    expect(decisions["libsql"]).toEqual([
      { id: "exact", boosted: 1 },
      { id: "semantic", boosted: 0 },
    ]);
    expect(decisions["turso"]).toEqual(decisions["libsql"]);
  });

  test("an empty query boosts nothing", async () => {
    const connection = createEntityDatabase({ url: "file::memory:" });
    try {
      await connection.client.execute(`
        CREATE TABLE entities (
          id TEXT NOT NULL,
          entityType TEXT NOT NULL,
          content TEXT NOT NULL,
          search_text TEXT,
          PRIMARY KEY (id, entityType)
        )
      `);
      await connection.client.execute(
        "INSERT INTO entities VALUES ('a', 'test', 'TypeScript generics', 'typescript generics'), ('b', 'test', 'unrelated prose', 'unrelated prose')",
      );

      for (const emptyQuery of ["", "   "]) {
        const boosted = await connection.db.all<{ boosted: number }>(sql`
          SELECT CASE WHEN ${buildKeywordMatch(emptyQuery)} THEN 1 ELSE 0 END
            AS boosted
          FROM entities
          ORDER BY id
        `);
        // instr(content, '') matches every row; an empty phrase must not
        // uniformly inflate scores past a caller's minScore threshold.
        expect(boosted).toEqual([{ boosted: 0 }, { boosted: 0 }]);
      }
    } finally {
      connection.client.close();
    }
  });
});
