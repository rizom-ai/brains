import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { existsSync } from "node:fs";
import { EntityService } from "../src/entityService";
import { EntityRegistry } from "../src/entityRegistry";
import { migrateEntities } from "../src/migrate";
import { createEntityDatabase } from "../src/db";
import {
  createSilentLogger,
  createMockJobQueueService,
  createTestEntity,
} from "@brains/test-utils";
import { mockEmbeddingService, MOCK_DIMENSIONS } from "./helpers/mock-services";
import { minimalTestSchema, minimalTestAdapter } from "./helpers/test-schemas";
import type { BaseEntity, EntityDbConfig } from "../src/types";

describe("Consolidated embedding database", () => {
  let tempDir: string;
  let entityService: EntityService;
  let dbConfig: EntityDbConfig;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "brain-emb-test-"));
    dbConfig = { url: `file:${join(tempDir, "brain.db")}` };
    const logger = createSilentLogger();
    await migrateEntities(dbConfig, logger);

    const entityRegistry = EntityRegistry.createFresh(logger);
    entityRegistry.registerEntityType(
      "test",
      minimalTestSchema,
      minimalTestAdapter,
    );
    entityService = EntityService.createFresh({
      embeddingService: mockEmbeddingService,
      entityRegistry,
      logger,
      jobQueueService: createMockJobQueueService({
        returns: { enqueue: "mock-job-id" },
      }),
      dbConfig,
    });
    await entityService.initialize();
  });

  afterEach(async () => {
    entityService.close();
    await rm(tempDir, { recursive: true, force: true });
  });

  async function countEmbeddings(): Promise<number> {
    const connection = createEntityDatabase(dbConfig);
    try {
      const result = await connection.client.execute(
        "SELECT count(*) AS count FROM embeddings",
      );
      return Number(result.rows[0]?.["count"] ?? 0);
    } finally {
      connection.client.close();
    }
  }

  async function createEmbeddedEntity(
    content = "TypeScript guide",
  ): Promise<BaseEntity> {
    const entity = createTestEntity("test", { content });
    await entityService.createEntity({ entity });
    await entityService.storeEmbedding({
      entityId: entity.id,
      entityType: entity.entityType,
      embedding: new Float32Array(MOCK_DIMENSIONS).fill(0.1),
      contentHash: entity.contentHash,
    });
    return entity;
  }

  test("does not create or open the legacy embeddings file", async () => {
    await createEmbeddedEntity();
    expect(existsSync(join(tempDir, "embeddings.db"))).toBe(false);
    expect(await countEmbeddings()).toBe(1);
  });

  test("search reads embeddings directly from the entity database", async () => {
    const entity = await createEmbeddedEntity();
    const results = await entityService.search({ query: "TypeScript" });
    expect(results[0]?.entity.id).toBe(entity.id);
  });

  test("a content update atomically invalidates the old embedding", async () => {
    const entity = await createEmbeddedEntity("Original content");
    expect(await countEmbeddings()).toBe(1);

    await entityService.updateEntity({
      entity: { ...entity, content: "Changed content" },
    });

    expect(await countEmbeddings()).toBe(0);
  });

  test("entity deletion removes its embedding", async () => {
    const entity = await createEmbeddedEntity();
    await entityService.deleteEntity({
      entityType: entity.entityType,
      id: entity.id,
    });
    expect(await countEmbeddings()).toBe(0);
  });

  test("a failed entity deletion rolls back embedding deletion", async () => {
    const entity = await createEmbeddedEntity();
    const connection = createEntityDatabase(dbConfig);
    await connection.client.execute(`
      CREATE TRIGGER reject_entity_delete
      BEFORE DELETE ON entities
      BEGIN
        SELECT RAISE(ABORT, 'injected delete failure');
      END
    `);
    connection.client.close();

    expect(
      entityService.deleteEntity({
        entityType: entity.entityType,
        id: entity.id,
      }),
    ).rejects.toThrow('Failed query: delete from "entities"');

    expect(await countEmbeddings()).toBe(1);
    expect(
      await entityService.getEntity({
        entityType: entity.entityType,
        id: entity.id,
      }),
    ).not.toBeNull();
  });
});
