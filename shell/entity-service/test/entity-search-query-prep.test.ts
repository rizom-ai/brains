import { describe, test, expect, mock } from "bun:test";
import { EntitySearch, MAX_SEARCH_QUERY_CHARS } from "../src/entity-search";
import { EntityRegistry } from "../src/entityRegistry";
import { EntitySerializer } from "../src/entity-serializer";
import { createMockLogger, createSilentLogger } from "@brains/test-utils";
import type { EntityDB } from "../src/db";
import type { IEmbeddingService } from "../src/embedding-types";
import { MOCK_DIMENSIONS } from "./helpers/mock-services";

function createSearchDb(): EntityDB {
  const selectResult = mock(() => Promise.resolve([]));
  const chainableMock = {
    from: mock(() => chainableMock),
    innerJoin: mock(() => chainableMock),
    where: mock(() => chainableMock),
    orderBy: mock(() => chainableMock),
    limit: mock(() => chainableMock),
    offset: selectResult,
  };

  return {
    select: mock(() => chainableMock),
  } as unknown as EntityDB;
}

function createDistanceDb(): EntityDB {
  const chainableMock = {
    from: mock(() => chainableMock),
    innerJoin: mock(() => chainableMock),
    orderBy: mock(() => Promise.resolve([])),
  };

  return {
    select: mock(() => chainableMock),
  } as unknown as EntityDB;
}

function createEntitySearch(options?: {
  logger?: ReturnType<typeof createMockLogger>;
  db?: EntityDB;
}): {
  entitySearch: EntitySearch;
  embeddingService: IEmbeddingService;
  logger: ReturnType<typeof createMockLogger>;
} {
  const logger = options?.logger ?? createSilentLogger();
  EntityRegistry.resetInstance();
  const entityRegistry = EntityRegistry.createFresh(logger);
  const serializer = new EntitySerializer(entityRegistry, logger);

  const embeddingService = {
    dimensions: MOCK_DIMENSIONS,
    generateEmbedding: mock(() =>
      Promise.resolve({
        embedding: new Float32Array(MOCK_DIMENSIONS).fill(0.1),
        usage: { tokens: 10 },
      }),
    ),
    generateEmbeddings: mock(() =>
      Promise.resolve({ embeddings: [], usage: { tokens: 0 } }),
    ),
  } as unknown as IEmbeddingService;

  const entitySearch = new EntitySearch(
    options?.db ?? createSearchDb(),
    embeddingService,
    serializer,
    logger,
  );

  return {
    entitySearch,
    embeddingService,
    logger,
  };
}

describe("EntitySearch query preparation", () => {
  test("normalizes whitespace before generating a search embedding", async () => {
    const { entitySearch, embeddingService } = createEntitySearch();

    await entitySearch.search("  hello\n\n   world  ");

    expect(embeddingService.generateEmbedding).toHaveBeenCalledWith(
      "hello world",
    );
  });

  test("truncates oversized search queries and emits a warning", async () => {
    const logger = createMockLogger();
    const { entitySearch, embeddingService } = createEntitySearch({ logger });
    const longQuery = "a".repeat(MAX_SEARCH_QUERY_CHARS + 25);

    await entitySearch.search(longQuery);

    expect(embeddingService.generateEmbedding).toHaveBeenCalledWith(
      "a".repeat(MAX_SEARCH_QUERY_CHARS),
    );
    expect(logger.warn).toHaveBeenCalledWith(
      "Truncating search query that exceeds max length",
      {
        originalLength: longQuery.length,
        truncatedLength: MAX_SEARCH_QUERY_CHARS,
      },
    );
  });

  test("applies query preparation to searchWithDistances too", async () => {
    const { entitySearch, embeddingService } = createEntitySearch({
      db: createDistanceDb(),
    });

    await entitySearch.searchWithDistances("  distance\n   query  ");

    expect(embeddingService.generateEmbedding).toHaveBeenCalledWith(
      "distance query",
    );
  });
});
