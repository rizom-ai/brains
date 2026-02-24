import { describe, test, expect, beforeEach, mock } from "bun:test";
import { EntitySearch } from "../src/entity-search";
import { EntityRegistry } from "../src/entityRegistry";
import { EntitySerializer } from "../src/entity-serializer";
import { createSilentLogger } from "@brains/test-utils";
import type { Logger } from "@brains/utils";
import type { IEmbeddingService } from "../src/embedding-types";
import type { EntityDB } from "../src/db";
import { z } from "@brains/utils";
import { baseEntitySchema } from "../src/types";
import type { EntityAdapter } from "../src/types";

const testEntitySchema = baseEntitySchema.extend({
  entityType: z.string(),
  title: z.string().optional(),
});

type TestEntity = z.infer<typeof testEntitySchema>;

const mockAdapter: EntityAdapter<TestEntity> = {
  entityType: "test",
  schema: testEntitySchema,
  fromMarkdown(): Partial<TestEntity> {
    return {};
  },
  toMarkdown(): string {
    return "";
  },
  extractMetadata(): Record<string, unknown> {
    return {};
  },
  parseFrontMatter<T>(): T {
    throw new Error("parseFrontMatter not implemented in mock");
  },
  generateFrontMatter(): string {
    return "---\n---";
  },
};

interface MockDbResult {
  id: string;
  entityType: string;
  content: string;
  contentHash: string;
  created: number;
  updated: number;
  metadata: Record<string, unknown>;
  distance: number;
  weighted_score: number;
}

function createMockResults(
  items: Array<{
    id: string;
    entityType: string;
    distance: number;
    weighted_score?: number;
  }>,
): MockDbResult[] {
  return items.map((item) => ({
    id: item.id,
    entityType: item.entityType,
    content: `# ${item.id}\n\nContent for ${item.id}`,
    contentHash: "abc123",
    created: Date.now(),
    updated: Date.now(),
    metadata: {},
    distance: item.distance,
    weighted_score: item.weighted_score ?? 1 - item.distance / 2,
  }));
}

describe("EntitySearch weight behavior", () => {
  let entitySearch: EntitySearch;
  let mockSelectFn: ReturnType<typeof mock>;

  beforeEach(() => {
    const logger: Logger = createSilentLogger();
    EntityRegistry.resetInstance();
    const entityRegistry = EntityRegistry.createFresh(logger);

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

    const mockEmbeddingService = {
      generateEmbedding: mock(() =>
        Promise.resolve(new Float32Array(384).fill(0.1)),
      ),
      generateEmbeddings: mock(() => Promise.resolve([])),
    } as unknown as IEmbeddingService;

    mockSelectFn = mock(() => Promise.resolve([]));

    const chainableMock = {
      from: mock(() => chainableMock),
      innerJoin: mock(() => chainableMock),
      where: mock(() => chainableMock),
      orderBy: mock(() => chainableMock),
      limit: mock(() => chainableMock),
      offset: mockSelectFn,
    };

    const mockDb = {
      select: mock(() => chainableMock),
    } as unknown as EntityDB;

    const serializer = new EntitySerializer(entityRegistry, logger);

    entitySearch = new EntitySearch(
      mockDb,
      mockEmbeddingService,
      serializer,
      logger,
    );
  });

  test("without weight option, results maintain original order by distance", async () => {
    mockSelectFn.mockResolvedValue(
      createMockResults([
        { id: "topic-1", entityType: "topic", distance: 0.2 },
        { id: "post-1", entityType: "post", distance: 0.4 },
        { id: "deck-1", entityType: "deck", distance: 0.6 },
      ]),
    );

    const results = await entitySearch.search("test query");

    expect(results[0]?.entity.id).toBe("topic-1");
    expect(results[1]?.entity.id).toBe("post-1");
    expect(results[2]?.entity.id).toBe("deck-1");
  });

  test("with weight option, SQL calculates weighted_score and orders by it", async () => {
    mockSelectFn.mockResolvedValue(
      createMockResults([
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
      weight: { post: 2.0, deck: 1.5, topic: 0.5 },
    });

    expect(results[0]?.entity.id).toBe("post-1");
    expect(results[0]?.score).toBe(1.6);
    expect(results[1]?.entity.id).toBe("deck-1");
    expect(results[1]?.score).toBe(1.05);
    expect(results[2]?.entity.id).toBe("topic-1");
    expect(results[2]?.score).toBe(0.45);
  });

  test("entity types without weight config use default multiplier of 1.0", async () => {
    mockSelectFn.mockResolvedValue(
      createMockResults([
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
      weight: { post: 2.0 },
    });

    expect(results[0]?.entity.id).toBe("post-1");
    expect(results[0]?.score).toBe(1.6);
    expect(results[1]?.entity.id).toBe("topic-1");
    expect(results[1]?.score).toBe(0.8);
  });

  test("empty weight object behaves same as no weight", async () => {
    mockSelectFn.mockResolvedValue(
      createMockResults([
        { id: "topic-1", entityType: "topic", distance: 0.2 },
        { id: "post-1", entityType: "post", distance: 0.4 },
      ]),
    );

    const results = await entitySearch.search("test query", { weight: {} });

    expect(results[0]?.entity.id).toBe("topic-1");
    expect(results[1]?.entity.id).toBe("post-1");
  });

  test("limit is respected with SQL-based weighted ordering", async () => {
    mockSelectFn.mockResolvedValue(
      createMockResults([
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
      weight: { post: 2.0, topic: 0.5 },
    });

    expect(results.length).toBe(2);
    expect(results[0]?.entity.id).toBe("post-1");
    expect(results[1]?.entity.id).toBe("post-2");
  });
});
