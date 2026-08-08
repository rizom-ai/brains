import { join } from "node:path";
import type { EntityDbConfig } from "../../src/types";
import { migrateEntities } from "../../src/migrate";
import { migrateEmbeddingDatabase } from "../../src/db/embedding-db";
import { createClient } from "@libsql/client";
import { createSilentLogger, createTestDatabase } from "@brains/test-utils";
import type { TestDatabase } from "@brains/test-utils";
import { computeContentHash } from "@brains/utils/hash";
import { MOCK_DIMENSIONS } from "./mock-services";
import { entities } from "../../src/schema/entities";
import { embeddings } from "../../src/schema/embeddings";
import { createEntityDatabase } from "../../src/db";
import { createEmbeddingDatabase } from "../../src/db/embedding-db";

export interface TestEntityDatabase extends TestDatabase {
  config: EntityDbConfig;
  embeddingConfig: EntityDbConfig;
  embeddingDbPath: string;
}

/**
 * Create temporary test databases (entity + embedding).
 * Each test gets its own isolated database pair.
 *
 * Both files live in the one temp directory the shared helper created, so a
 * single `cleanup` covers the pair.
 */
export async function createTestEntityDatabase(): Promise<TestEntityDatabase> {
  const database = await createTestDatabase({
    prefix: "brain-entity-test-",
    filename: "test-entities.db",
    migrate: (url) => migrateEntities({ url }, createSilentLogger()),
  });

  const embeddingDbPath = join(database.dir, "test-embeddings.db");
  const embeddingConfig: EntityDbConfig = { url: `file:${embeddingDbPath}` };

  const embeddingClient = database.track(
    createClient({ url: embeddingConfig.url }),
  );
  await migrateEmbeddingDatabase(embeddingClient, MOCK_DIMENSIONS);

  return {
    ...database,
    config: { url: database.url },
    embeddingConfig,
    embeddingDbPath,
  };
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
