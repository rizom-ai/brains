import { afterEach, describe, expect, test } from "bun:test";
import { createSqliteDatabase, closeSqliteClient } from "@brains/db";
import {
  createMockJobQueueService,
  createSilentLogger,
} from "@brains/test-utils";
import { EntityService } from "../src/entityService";
import { EntityRegistry } from "../src/entityRegistry";
import { SEARCH_TEXT_BACKFILL_PAGE_SIZE } from "../src/entityService";
import { mockEmbeddingService } from "./helpers/mock-services";
import { createTestEntityDatabase } from "./helpers/test-entity-db";
import { minimalTestAdapter, minimalTestSchema } from "./helpers/test-schemas";

/**
 * The backfill runs inside initialize(), so it sits on every instance's boot
 * path after the search_text migration. It must cover every row without
 * reading the whole corpus into one transaction.
 */
describe("search_text backfill", () => {
  const cleanups: Array<() => Promise<void>> = [];

  afterEach(async () => {
    for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
  });

  async function seedRowsWithoutSearchText(count: number): Promise<{
    url: string;
    readBackfilled: () => Promise<number>;
  }> {
    const testDb = await createTestEntityDatabase();
    cleanups.push(testDb.cleanup);
    const { client } = createSqliteDatabase({
      url: testDb.config.url,
      schema: {},
    });
    const now = Date.now();
    for (let index = 0; index < count; index++) {
      await client.execute({
        sql: `INSERT INTO entities (
          id, entityType, content, contentHash, visibility,
          metadata, created, updated, search_text
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL)`,
        args: [
          `note-${String(index).padStart(6, "0")}`,
          "test",
          `Corpus entry ${index} about Café`,
          `hash-${index}`,
          "public",
          "{}",
          now,
          now,
        ],
      });
    }
    await closeSqliteClient(client);

    return {
      url: testDb.config.url,
      readBackfilled: async (): Promise<number> => {
        const { client: reader } = createSqliteDatabase({
          url: testDb.config.url,
          schema: {},
        });
        try {
          const result = await reader.execute(
            "SELECT count(*) AS filled FROM entities WHERE search_text IS NOT NULL",
          );
          return Number(result.rows[0]?.["filled"] ?? 0);
        } finally {
          await closeSqliteClient(reader);
        }
      },
    };
  }

  async function bootService(url: string): Promise<EntityService> {
    const logger = createSilentLogger();
    const entityRegistry = EntityRegistry.createFresh(logger);
    entityRegistry.registerEntityType(
      "test",
      minimalTestSchema,
      minimalTestAdapter,
      {
        embeddable: false,
      },
    );
    const service = EntityService.createFresh({
      embeddingService: mockEmbeddingService,
      embeddingsEnabled: false,
      entityRegistry,
      logger,
      jobQueueService: createMockJobQueueService(),
      dbConfig: { url },
    });
    cleanups.push(async () => {
      service.close();
    });
    await service.initialize();
    return service;
  }

  test("fills every row when the corpus spans more than one page", async () => {
    const rowCount = SEARCH_TEXT_BACKFILL_PAGE_SIZE * 2 + 7;
    const seeded = await seedRowsWithoutSearchText(rowCount);

    await bootService(seeded.url);

    expect(await seeded.readBackfilled()).toBe(rowCount);
  });

  test("keeps entities sharing an id across a page boundary", async () => {
    const rowCount = SEARCH_TEXT_BACKFILL_PAGE_SIZE + 1;
    const seeded = await seedRowsWithoutSearchText(rowCount);
    const { client } = createSqliteDatabase({ url: seeded.url, schema: {} });
    try {
      await client.execute({
        sql: `INSERT INTO entities (
          id, entityType, content, contentHash, visibility,
          metadata, created, updated, search_text
        ) SELECT id, 'test-z', content, contentHash, visibility,
          metadata, created, updated, NULL FROM entities WHERE id = ?`,
        args: [
          `note-${String(SEARCH_TEXT_BACKFILL_PAGE_SIZE - 1).padStart(6, "0")}`,
        ],
      });
    } finally {
      await closeSqliteClient(client);
    }

    await bootService(seeded.url);
    expect(await seeded.readBackfilled()).toBe(rowCount + 1);
  });

  test("commits each page, so an interrupted boot resumes instead of restarting", async () => {
    const rowCount = SEARCH_TEXT_BACKFILL_PAGE_SIZE * 2 + 7;
    const seeded = await seedRowsWithoutSearchText(rowCount);

    // Fail one row in the final page. Whatever earlier pages committed is what
    // a resumed boot gets to keep; a single all-or-nothing transaction keeps
    // nothing.
    const { client } = createSqliteDatabase({ url: seeded.url, schema: {} });
    await client.execute(`
      CREATE TRIGGER block_last_backfill
      BEFORE UPDATE OF search_text ON entities
      WHEN NEW.id = 'note-${String(rowCount - 1).padStart(6, "0")}'
      BEGIN SELECT RAISE(ABORT, 'blocked'); END
    `);
    await closeSqliteClient(client);

    const failure = await bootService(seeded.url).then(
      () => null,
      (error: unknown) => error,
    );
    expect(failure).toBeInstanceOf(Error);

    expect(await seeded.readBackfilled()).toBe(
      SEARCH_TEXT_BACKFILL_PAGE_SIZE * 2,
    );

    const { client: recoveryClient } = createSqliteDatabase({
      url: seeded.url,
      schema: {},
    });
    try {
      await recoveryClient.execute("DROP TRIGGER block_last_backfill");
    } finally {
      await closeSqliteClient(recoveryClient);
    }
    await bootService(seeded.url);
    expect(await seeded.readBackfilled()).toBe(rowCount);
  });

  test("normalizes the backfilled text the same way search does", async () => {
    const seeded = await seedRowsWithoutSearchText(1);

    const service = await bootService(seeded.url);

    // Normalized at rest, so an accented query matches a migrated row.
    const results = await service.search({
      query: "café",
      options: { visibilityScope: "restricted" },
    });
    expect(results.map((result) => result.entity.id)).toContain("note-000000");
  });
});
