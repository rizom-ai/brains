import { describe, test, expect, beforeEach, mock } from "bun:test";
import { EntitySearch } from "../src/entity-search";
import { EntityRegistry } from "../src/entityRegistry";
import { createSilentLogger } from "@brains/test-utils";
import type { Logger } from "@brains/utils";
import type { IEmbeddingService } from "@brains/embedding-service";
import type { EntityDB } from "../src/db";
import { z } from "@brains/utils";
import { baseEntitySchema } from "../src/types";

// Test entity schema
const testEntitySchema = baseEntitySchema.extend({
  entityType: z.string(),
  title: z.string().optional(),
});

// Mock adapter
const mockAdapter = {
  entityType: "test",
  schema: testEntitySchema,
  fromMarkdown: () => ({}),
  toMarkdown: () => "",
  extractMetadata: () => ({}),
  parseFrontMatter: <T>() => ({}) as T,
  generateFrontMatter: () => "---\n---",
};

describe("EntitySearch weight behavior", () => {
  let entitySearch: EntitySearch;
  let mockDb: EntityDB;
  let mockEmbeddingService: IEmbeddingService;
  let entityRegistry: EntityRegistry;
  let logger: Logger;
  let mockSelectFn: ReturnType<typeof mock>;

  // Helper to create mock DB results with weighted_score
  // When weights are applied in SQL, DB returns results with weighted_score already calculated
  const createMockResults = (
    items: Array<{
      id: string;
      entityType: string;
      distance: number;
      weighted_score?: number;
    }>,
  ) =>
    items.map((item) => ({
      id: item.id,
      entityType: item.entityType,
      content: `# ${item.id}\n\nContent for ${item.id}`,
      contentHash: "abc123",
      created: Date.now(),
      updated: Date.now(),
      metadata: {},
      distance: item.distance,
      // weighted_score is computed in SQL when weights provided
      weighted_score: item.weighted_score ?? 1 - item.distance / 2,
    }));

  beforeEach(() => {
    logger = createSilentLogger();
    EntityRegistry.resetInstance();
    entityRegistry = EntityRegistry.createFresh(logger);

    // Register test entity types
    entityRegistry.registerEntityType("post", testEntitySchema, {
      ...mockAdapter,
      entityType: "post",
    });
    entityRegistry.registerEntityType("topic", testEntitySchema, {
      ...mockAdapter,
      entityType: "topic",
    });
    entityRegistry.registerEntityType("deck", testEntitySchema, {
      ...mockAdapter,
      entityType: "deck",
    });

    // Mock embedding service
    mockEmbeddingService = {
      generateEmbedding: mock(() =>
        Promise.resolve(new Float32Array(384).fill(0.1)),
      ),
      generateEmbeddings: mock(() => Promise.resolve([])),
    } as unknown as IEmbeddingService;

    // Create chainable mock for db.select().from().where().orderBy().limit().offset()
    mockSelectFn = mock(() => Promise.resolve([]));

    const chainableMock = {
      from: mock(() => chainableMock),
      where: mock(() => chainableMock),
      orderBy: mock(() => chainableMock),
      limit: mock(() => chainableMock),
      offset: mockSelectFn,
    };

    mockDb = {
      select: mock(() => chainableMock),
    } as unknown as EntityDB;

    entitySearch = new EntitySearch(
      mockDb,
      mockEmbeddingService,
      entityRegistry,
      logger,
    );
  });

  test("without weight option, results maintain original order by distance", async () => {
    // Setup: topic has best raw score (lowest distance)
    // DB returns in distance order, weighted_score = 1 - distance/2
    mockSelectFn.mockResolvedValue(
      createMockResults([
        { id: "topic-1", entityType: "topic", distance: 0.2 }, // score: 0.9
        { id: "post-1", entityType: "post", distance: 0.4 }, // score: 0.8
        { id: "deck-1", entityType: "deck", distance: 0.6 }, // score: 0.7
      ]),
    );

    const results = await entitySearch.search("test query");

    // Without weight, topic should be first (best raw score)
    expect(results[0]?.entity.id).toBe("topic-1");
    expect(results[1]?.entity.id).toBe("post-1");
    expect(results[2]?.entity.id).toBe("deck-1");
  });

  test("with weight option, SQL calculates weighted_score and orders by it", async () => {
    // With SQL-based weighting, DB returns results already sorted by weighted_score
    // Simulating: post gets 2.0x, deck gets 1.5x, topic gets 0.5x
    // Raw scores: topic=0.9, post=0.8, deck=0.7
    // Weighted: post=1.6, deck=1.05, topic=0.45
    mockSelectFn.mockResolvedValue(
      createMockResults([
        // DB returns in weighted_score DESC order
        {
          id: "post-1",
          entityType: "post",
          distance: 0.4,
          weighted_score: 1.6,
        },
        {
          id: "deck-1",
          entityType: "deck",
          distance: 0.6,
          weighted_score: 1.05,
        },
        {
          id: "topic-1",
          entityType: "topic",
          distance: 0.2,
          weighted_score: 0.45,
        },
      ]),
    );

    const results = await entitySearch.search("test query", {
      weight: {
        post: 2.0,
        deck: 1.5,
        topic: 0.5,
      },
    });

    // Results come back already sorted by weighted_score from SQL
    expect(results[0]?.entity.id).toBe("post-1");
    expect(results[0]?.score).toBe(1.6);

    expect(results[1]?.entity.id).toBe("deck-1");
    expect(results[1]?.score).toBe(1.05);

    expect(results[2]?.entity.id).toBe("topic-1");
    expect(results[2]?.score).toBe(0.45);
  });

  test("entity types without weight config use default multiplier of 1.0", async () => {
    // post gets 2.0x, topic uses default 1.0x
    // Raw scores both 0.8 -> post=1.6, topic=0.8
    mockSelectFn.mockResolvedValue(
      createMockResults([
        // DB returns sorted by weighted_score
        {
          id: "post-1",
          entityType: "post",
          distance: 0.4,
          weighted_score: 1.6,
        },
        {
          id: "topic-1",
          entityType: "topic",
          distance: 0.4,
          weighted_score: 0.8,
        },
      ]),
    );

    const results = await entitySearch.search("test query", {
      weight: {
        post: 2.0,
        // topic not specified, uses default 1.0
      },
    });

    expect(results[0]?.entity.id).toBe("post-1");
    expect(results[0]?.score).toBe(1.6);

    expect(results[1]?.entity.id).toBe("topic-1");
    expect(results[1]?.score).toBe(0.8);
  });

  test("empty weight object behaves same as no weight", async () => {
    // No weights = sort by distance, score = 1 - distance/2
    mockSelectFn.mockResolvedValue(
      createMockResults([
        { id: "topic-1", entityType: "topic", distance: 0.2 }, // score: 0.9
        { id: "post-1", entityType: "post", distance: 0.4 }, // score: 0.8
      ]),
    );

    const results = await entitySearch.search("test query", {
      weight: {},
    });

    // Original distance order maintained
    expect(results[0]?.entity.id).toBe("topic-1");
    expect(results[1]?.entity.id).toBe("post-1");
  });

  test("limit is respected with SQL-based weighted ordering", async () => {
    // With weights applied in SQL, limit works normally
    // post gets 2.0x, topic gets 0.5x
    mockSelectFn.mockResolvedValue(
      createMockResults([
        // DB returns top 2 by weighted_score (limit applied in SQL)
        {
          id: "post-1",
          entityType: "post",
          distance: 0.5,
          weighted_score: 1.5,
        },
        {
          id: "post-2",
          entityType: "post",
          distance: 0.6,
          weighted_score: 1.4,
        },
      ]),
    );

    const results = await entitySearch.search("test query", {
      limit: 2,
      weight: {
        post: 2.0,
        topic: 0.5,
      },
    });

    expect(results.length).toBe(2);
    expect(results[0]?.entity.id).toBe("post-1");
    expect(results[1]?.entity.id).toBe("post-2");
  });
});
