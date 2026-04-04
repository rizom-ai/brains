import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { existsSync } from "node:fs";
import { EntityService } from "../src/entityService";
import { EntityRegistry } from "../src/entityRegistry";
import { migrateEntities } from "../src/migrate";
import { migrateEmbeddingDatabase } from "../src/db/embedding-db";
import { createClient } from "@libsql/client";
import {
  createSilentLogger,
  createMockJobQueueService,
  createTestEntity,
} from "@brains/test-utils";
import { mockEmbeddingService } from "./helpers/mock-services";
import { minimalTestSchema, minimalTestAdapter } from "./helpers/test-schemas";
import type { EntityDbConfig } from "../src/types";

describe("Separate embedding database", () => {
  let tempDir: string;
  let entityService: EntityService;
  let entityDbConfig: EntityDbConfig;
  let embeddingDbConfig: EntityDbConfig;

  beforeEach(async () => {
    EntityService.resetInstance();
    EntityRegistry.resetInstance();

    tempDir = await mkdtemp(join(tmpdir(), "brain-sep-emb-test-"));

    entityDbConfig = { url: `file:${join(tempDir, "brain.db")}` };
    embeddingDbConfig = { url: `file:${join(tempDir, "embeddings.db")}` };

    const logger = createSilentLogger();

    // Run entity DB migrations (creates entities table)
    await migrateEntities(entityDbConfig, logger);

    // Run embedding DB migrations (creates embeddings table)
    const embClient = createClient({ url: embeddingDbConfig.url });
    await migrateEmbeddingDatabase(embClient);
    embClient.close();
    const entityRegistry = EntityRegistry.createFresh(logger);
    entityRegistry.registerEntityType(
      "test",
      minimalTestSchema,
      minimalTestAdapter,
    );

    const jobQueueService = createMockJobQueueService({
      returns: { enqueue: "mock-job-id" },
    });

    entityService = EntityService.createFresh({
      embeddingService: mockEmbeddingService,
      entityRegistry,
      logger,
      jobQueueService,
      dbConfig: entityDbConfig,
      embeddingDbConfig,
    });
  });

  afterEach(async () => {
    EntityService.resetInstance();
    EntityRegistry.resetInstance();
    await rm(tempDir, { recursive: true, force: true });
  });

  test("creates separate embedding DB file on disk", () => {
    const embDbPath = join(tempDir, "embeddings.db");
    expect(existsSync(embDbPath)).toBe(true);
  });

  test("entity DB does not have embedding data", async () => {
    // Store an embedding via the service
    const testEntity = createTestEntity("test", { content: "Hello" });
    await entityService.createEntity(testEntity);
    await entityService.storeEmbedding({
      entityId: testEntity.id,
      entityType: "test",
      embedding: new Float32Array(384).fill(0.1),
      contentHash: testEntity.contentHash,
    });

    // Entity DB's embeddings table (from migration) should be empty —
    // the write went to the separate embedding DB
    const client = createClient({ url: entityDbConfig.url });
    const result = await client.execute(
      "SELECT count(*) as cnt FROM embeddings",
    );
    expect(result.rows[0]?.["cnt"]).toBe(0);
    client.close();
  });

  test("storeEmbedding writes to separate embedding DB", async () => {
    const testEntity = createTestEntity("test", { content: "Hello world" });
    await entityService.createEntity(testEntity);

    await entityService.storeEmbedding({
      entityId: testEntity.id,
      entityType: "test",
      embedding: new Float32Array(384).fill(0.1),
      contentHash: testEntity.contentHash,
    });

    // Verify embedding is in the separate DB
    const embClient = createClient({ url: embeddingDbConfig.url });
    const result = await embClient.execute(
      "SELECT count(*) as cnt FROM embeddings",
    );
    expect(result.rows[0]?.["cnt"]).toBe(1);
    embClient.close();
  });

  test("search works across both databases", async () => {
    // Create entity
    const testEntity = createTestEntity("test", {
      content: "TypeScript programming guide",
    });
    await entityService.createEntity(testEntity);

    // Store embedding
    await entityService.storeEmbedding({
      entityId: testEntity.id,
      entityType: "test",
      embedding: new Float32Array(384).fill(0.1),
      contentHash: testEntity.contentHash,
    });

    // Search should join across entity DB and embedding DB
    const results = await entityService.search("TypeScript");
    expect(results.length).toBeGreaterThan(0);
    expect(results[0]?.entity.id).toBe(testEntity.id);
  });

  test("entity operations work without embedding DB interference", async () => {
    const testEntity = createTestEntity("test", {
      content: "Test content",
    });

    // Create
    const result = await entityService.createEntity(testEntity);
    expect(result.entityId).toBeDefined();

    // Read
    const retrieved = await entityService.getEntity("test", testEntity.id);
    expect(retrieved).not.toBeNull();
    expect(retrieved?.content).toContain("Test content");

    // List
    const listed = await entityService.listEntities("test");
    expect(listed.length).toBe(1);

    // Delete
    const deleted = await entityService.deleteEntity("test", testEntity.id);
    expect(deleted).toBe(true);
  });

  test("embedding upsert works in separate DB", async () => {
    const testEntity = createTestEntity("test", { content: "Hello" });
    await entityService.createEntity(testEntity);

    await entityService.storeEmbedding({
      entityId: testEntity.id,
      entityType: "test",
      embedding: new Float32Array(384).fill(0.1),
      contentHash: "hash-1",
    });

    await entityService.storeEmbedding({
      entityId: testEntity.id,
      entityType: "test",
      embedding: new Float32Array(384).fill(0.5),
      contentHash: "hash-2",
    });

    const embClient = createClient({ url: embeddingDbConfig.url });
    const result = await embClient.execute("SELECT * FROM embeddings");
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]?.["content_hash"]).toBe("hash-2");
    embClient.close();
  });

  test("delete entity does not leave orphan embeddings", async () => {
    const testEntity = createTestEntity("test", { content: "To be deleted" });
    await entityService.createEntity(testEntity);

    await entityService.storeEmbedding({
      entityId: testEntity.id,
      entityType: "test",
      embedding: new Float32Array(384).fill(0.1),
      contentHash: testEntity.contentHash,
    });

    await entityService.deleteEntity("test", testEntity.id);

    const embClient = createClient({ url: embeddingDbConfig.url });
    const result = await embClient.execute(
      "SELECT count(*) as cnt FROM embeddings",
    );
    expect(result.rows[0]?.["cnt"]).toBe(0);
    embClient.close();
  });
});
