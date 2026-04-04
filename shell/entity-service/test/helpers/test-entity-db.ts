import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { EntityDbConfig } from "../../src/types";
import { migrateEntities } from "../../src/migrate";
import {
  migrateEmbeddingDatabase,
  ensureEmbeddingIndexes,
} from "../../src/db/embedding-db";
import { createClient } from "@libsql/client";
import { createSilentLogger } from "@brains/test-utils";
import { computeContentHash } from "@brains/utils/hash";
import { MOCK_DIMENSIONS } from "./mock-services";
import { entities } from "../../src/schema/entities";
import { embeddings } from "../../src/schema/embeddings";
import { createEntityDatabase } from "../../src/db";
import { createEmbeddingDatabase } from "../../src/db/embedding-db";

/**
 * Create temporary test databases (entity + embedding).
 * Each test gets its own isolated database pair.
 */
export async function createTestEntityDatabase(): Promise<{
  config: EntityDbConfig;
  embeddingConfig: EntityDbConfig;
  cleanup: () => Promise<void>;
  dbPath: string;
  embeddingDbPath: string;
}> {
  const tempDir = await mkdtemp(join(tmpdir(), "brain-entity-test-"));
  const dbPath = join(tempDir, "test-entities.db");
  const embeddingDbPath = join(tempDir, "test-embeddings.db");
  const config: EntityDbConfig = { url: `file:${dbPath}` };
  const embeddingConfig: EntityDbConfig = { url: `file:${embeddingDbPath}` };

  const logger = createSilentLogger();
  await migrateEntities(config, logger);

  // Migrate embedding DB
  const embClient = createClient({ url: embeddingConfig.url });
  await migrateEmbeddingDatabase(embClient, MOCK_DIMENSIONS);
  await ensureEmbeddingIndexes(embClient);
  embClient.close();

  const cleanup = async (): Promise<void> => {
    await rm(tempDir, { recursive: true, force: true });
  };

  return { config, embeddingConfig, cleanup, dbPath, embeddingDbPath };
}

export interface TestEntityData {
  id: string;
  entityType: string;
  content: string;
  metadata: Record<string, unknown>;
  created: number;
  updated: number;
  embedding: Float32Array;
}

/**
 * Insert a test entity directly into the database with its embedding.
 * Writes entity to entity DB and embedding to embedding DB.
 */
export async function insertTestEntity(
  config: EntityDbConfig,
  data: TestEntityData,
  embeddingConfig: EntityDbConfig,
): Promise<void> {
  const { db, client } = createEntityDatabase(config);
  const contentHash = computeContentHash(data.content);

  await db.insert(entities).values({
    id: data.id,
    entityType: data.entityType,
    content: data.content,
    contentHash,
    metadata: data.metadata,
    created: data.created,
    updated: data.updated,
  });

  client.close();

  const { db: embDb, client: embClient } =
    createEmbeddingDatabase(embeddingConfig);

  await embDb.insert(embeddings).values({
    entityId: data.id,
    entityType: data.entityType,
    embedding: data.embedding,
    contentHash,
  });

  embClient.close();
}
