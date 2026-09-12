import { inspect } from "node:util";
import { deferred } from "@brains/utils/deferred";
import { fakeEntityDb } from "./helpers/fake-entity-db";
import type { EntityDB } from "../src/db";
import { describe, test, expect, mock } from "bun:test";
import { EntitySearch, MAX_SEARCH_QUERY_CHARS } from "../src/entity-search";
import { EntityRegistry } from "../src/entityRegistry";
import { EntitySerializer } from "../src/entity-serializer";
import { createMockLogger, createSilentLogger } from "@brains/test-utils";
import type { QueryEmbedder } from "../src/entity-search";
import { MOCK_DIMENSIONS } from "./helpers/mock-services";

interface SearchChain {
  from: (...args: unknown[]) => SearchChain;
  innerJoin: (...args: unknown[]) => SearchChain;
  where: (condition: unknown) => SearchChain;
  orderBy: (...args: unknown[]) => SearchChain;
  limit: (...args: unknown[]) => SearchChain;
  offset: (...args: unknown[]) => Promise<unknown[]>;
}

function createSearchDb(onWhere?: (condition: unknown) => void): EntityDB {
  const selectResult = mock(() => Promise.resolve([]));
  const chainableMock: SearchChain = {
    from: mock(() => chainableMock),
    innerJoin: mock(() => chainableMock),
    where: mock((condition: unknown) => {
      onWhere?.(condition);
      return chainableMock;
    }),
    orderBy: mock(() => chainableMock),
    limit: mock(() => chainableMock),
    offset: selectResult,
  };

  return fakeEntityDb(() => chainableMock);
}

function createDistanceDb(): EntityDB {
  const chainableMock = {
    from: mock(() => chainableMock),
    innerJoin: mock(() => chainableMock),
    orderBy: mock(() => Promise.resolve([])),
  };

  return fakeEntityDb(() => chainableMock);
}

function createEntitySearch(options?: {
  logger?: ReturnType<typeof createMockLogger>;
  db?: EntityDB;
}): {
  entitySearch: EntitySearch;
  embeddingService: QueryEmbedder;
  logger: ReturnType<typeof createMockLogger>;
} {
  const logger = options?.logger ?? createSilentLogger();
  const entityRegistry = EntityRegistry.createFresh(logger);
  const serializer = new EntitySerializer(entityRegistry, logger);

  // generateEmbedding is the whole surface search uses; dimensions and
  // generateEmbeddings were on the old fake and nothing called them.
  const embeddingService = {
    generateEmbedding: mock(() =>
      Promise.resolve({
        embedding: new Float32Array(MOCK_DIMENSIONS).fill(0.1),
        usage: { tokens: 10 },
      }),
    ),
  } satisfies QueryEmbedder;

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
  const readBudget = { rows: 1, rowBytes: 1000, queryCharacters: 40 };

  test("rejects oversized bounded input before embedding and suppresses query previews", async () => {
    const logger = createMockLogger();
    const { entitySearch, embeddingService } = createEntitySearch({ logger });
    expect(
      await entitySearch
        .search("x".repeat(41), { readBudget })
        .catch(() => null),
    ).toBeNull();
    expect(embeddingService.generateEmbedding).not.toHaveBeenCalled();
    const query = "private visitor wording";
    await entitySearch.search(query, { readBudget });
    expect(logger.debug).not.toHaveBeenCalledWith(
      expect.stringContaining(query),
    );
    expect(logger.error).not.toHaveBeenCalled();
  });

  test("propagates cancellation and starts no SQL after a late embedding completes", async () => {
    let queries = 0;
    const { entitySearch, embeddingService } = createEntitySearch({
      db: createSearchDb(() => {
        queries++;
      }),
    });
    const controller = new AbortController();
    const entered = deferred<void>();
    const release = deferred<void>();
    let captured: AbortSignal | undefined;
    embeddingService.generateEmbedding = async (
      _text,
      signal,
    ): ReturnType<QueryEmbedder["generateEmbedding"]> => {
      captured = signal;
      entered.resolve();
      await release.promise;
      return {
        embedding: new Float32Array(MOCK_DIMENSIONS).fill(0.1),
        usage: { tokens: 1 },
      };
    };
    let settled = false;
    const pending = entitySearch
      .search("question", { readBudget, signal: controller.signal })
      .catch(() => null)
      .finally(() => {
        settled = true;
      });
    await entered.promise;
    expect(captured).toBe(controller.signal);
    controller.abort();
    await Promise.resolve();
    expect(settled).toBe(false);
    release.resolve();
    expect(await pending).toBeNull();
    expect(queries).toBe(0);
  });

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

  test("excludes queued and failed generation stubs by default", async () => {
    let whereCondition: unknown;
    const { entitySearch } = createEntitySearch({
      db: createSearchDb((condition) => {
        whereCondition = condition;
      }),
    });

    await entitySearch.search("queued stub");

    expect(inspect(whereCondition, { depth: 20 })).toContain("generating");
  });

  test("can include queued and failed generation stubs for diagnostics", async () => {
    let whereCondition: unknown;
    const { entitySearch } = createEntitySearch({
      db: createSearchDb((condition) => {
        whereCondition = condition;
      }),
    });

    await entitySearch.search("queued stub", { includeUngenerated: true });

    expect(inspect(whereCondition, { depth: 20 })).not.toContain("generating");
  });
});
