import type { EntityDbConfig } from "../../src/types";
import { migrateEntities } from "../../src/migrate";
import { createSilentLogger, createTestDatabase } from "@brains/test-utils";
import type { TestDatabase } from "@brains/test-utils";
import { computeContentHash } from "@brains/utils/hash";
import { entities } from "../../src/schema/entities";
import { embeddings } from "../../src/schema/embeddings";
import { createEntityDatabase } from "../../src/db";

export interface TestEntityDatabase extends TestDatabase {
  config: EntityDbConfig;
}

/**
 * Create a temporary migrated entity database.
 *
 * Embeddings live in the entity database itself, so this is one file rather
 * than the entity/embedding pair the separate-database layout needed.
 */
export async function createTestEntityDatabase(): Promise<TestEntityDatabase> {
  const database = await createTestDatabase({
    prefix: "brain-entity-test-",
    filename: "test-entities.db",
    migrate: (url) => migrateEntities({ url }, createSilentLogger()),
  });

  return { ...database, config: { url: database.url } };
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

/** Insert a test entity and its embedding into the entity database. */
export async function insertTestEntity(
  config: EntityDbConfig,
  data: TestEntityData,
): Promise<void> {
  const { db, client } = createEntityDatabase(config);
  const contentHash = computeContentHash(data.content);

  await db.transaction(async (transaction) => {
    await transaction.insert(entities).values({
      id: data.id,
      entityType: data.entityType,
      content: data.content,
      contentHash,
      metadata: data.metadata,
      created: data.created,
      updated: data.updated,
    });
    await transaction.insert(embeddings).values({
      entityId: data.id,
      entityType: data.entityType,
      embedding: data.embedding,
      contentHash,
    });
  });

  client.close();
}
