import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { EntityDbConfig } from "../../src/types";
import { migrateEntities } from "../../src/migrate";
import { createSilentLogger } from "@brains/test-utils";
import { computeContentHash } from "@brains/utils/hash";
import { entities } from "../../src/schema/entities";
import { embeddings } from "../../src/schema/embeddings";
import { createEntityDatabase } from "../../src/db";

/** Create a temporary migrated entity database. */
export async function createTestEntityDatabase(): Promise<{
  config: EntityDbConfig;
  cleanup: () => Promise<void>;
  dbPath: string;
}> {
  const tempDir = await mkdtemp(join(tmpdir(), "brain-entity-test-"));
  const dbPath = join(tempDir, "test-entities.db");
  const config: EntityDbConfig = { url: `file:${dbPath}` };

  await migrateEntities(config, createSilentLogger());

  const cleanup = async (): Promise<void> => {
    await rm(tempDir, { recursive: true, force: true });
  };

  return { config, cleanup, dbPath };
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
