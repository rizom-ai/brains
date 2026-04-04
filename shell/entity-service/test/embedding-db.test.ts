import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { existsSync } from "node:fs";
import { createClient } from "@libsql/client";
import {
  createEmbeddingDatabase,
  ensureEmbeddingIndexes,
  attachEmbeddingDatabase,
} from "../src/db/embedding-db";
import type { EntityDbConfig } from "../src/types";

describe("Embedding Database", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "brain-emb-db-test-"));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  describe("createEmbeddingDatabase", () => {
    test("creates a separate database file", () => {
      const config: EntityDbConfig = {
        url: `file:${join(tempDir, "embeddings.db")}`,
      };
      const { db, client, url } = createEmbeddingDatabase(config);
      expect(db).toBeDefined();
      expect(client).toBeDefined();
      expect(url).toBe(config.url);
      client.close();
    });

    test("creates database with auth token", () => {
      const config: EntityDbConfig = {
        url: "libsql://test.turso.io",
        authToken: "test-token",
      };
      const { db, client, url } = createEmbeddingDatabase(config);
      expect(db).toBeDefined();
      expect(url).toBe(config.url);
      client.close();
    });

    test("database has embeddings table after migration", async () => {
      const dbPath = join(tempDir, "embeddings.db");
      const config: EntityDbConfig = { url: `file:${dbPath}` };
      const { client } = createEmbeddingDatabase(config);

      // Create the embeddings table (migration does this)
      await client.execute(`
        CREATE TABLE IF NOT EXISTS embeddings (
          entity_id TEXT NOT NULL,
          entity_type TEXT NOT NULL,
          embedding F32_BLOB(1536) NOT NULL,
          content_hash TEXT NOT NULL,
          PRIMARY KEY(entity_id, entity_type)
        )
      `);

      const tables = await client.execute(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='embeddings'",
      );
      expect(tables.rows).toHaveLength(1);
      client.close();
    });

    test("database does NOT have entities table", async () => {
      const dbPath = join(tempDir, "embeddings.db");
      const config: EntityDbConfig = { url: `file:${dbPath}` };
      const { client } = createEmbeddingDatabase(config);

      const tables = await client.execute(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='entities'",
      );
      expect(tables.rows).toHaveLength(0);
      client.close();
    });
  });

  describe("ensureEmbeddingIndexes", () => {
    test("creates vector index on embeddings table", async () => {
      const config: EntityDbConfig = {
        url: `file:${join(tempDir, "embeddings.db")}`,
      };
      const { client } = createEmbeddingDatabase(config);

      await client.execute(`
        CREATE TABLE IF NOT EXISTS embeddings (
          entity_id TEXT NOT NULL,
          entity_type TEXT NOT NULL,
          embedding F32_BLOB(1536) NOT NULL,
          content_hash TEXT NOT NULL,
          PRIMARY KEY(entity_id, entity_type)
        )
      `);

      await ensureEmbeddingIndexes(client);

      // Verify index exists
      const indexes = await client.execute(
        "SELECT name FROM sqlite_master WHERE type='index' AND name='embeddings_embedding_idx'",
      );
      expect(indexes.rows).toHaveLength(1);
      client.close();
    });
  });

  describe("attachEmbeddingDatabase", () => {
    test("attaches embedding DB to entity client", async () => {
      // Create entity DB
      const entityDbPath = join(tempDir, "brain.db");
      const entityClient = createClient({ url: `file:${entityDbPath}` });
      await entityClient.execute(
        "CREATE TABLE IF NOT EXISTS entities (id TEXT PRIMARY KEY, entity_type TEXT, content TEXT)",
      );
      await entityClient.execute(
        "INSERT INTO entities VALUES ('e1', 'post', 'Hello')",
      );

      // Create embedding DB
      const embDbPath = join(tempDir, "embeddings.db");
      const embClient = createClient({ url: `file:${embDbPath}` });
      await embClient.execute(`
        CREATE TABLE IF NOT EXISTS embeddings (
          entity_id TEXT NOT NULL,
          entity_type TEXT NOT NULL,
          embedding F32_BLOB(4) NOT NULL,
          content_hash TEXT NOT NULL,
          PRIMARY KEY(entity_id, entity_type)
        )
      `);
      await embClient.execute({
        sql: "INSERT INTO embeddings VALUES ('e1', 'post', vector32(?), 'hash1')",
        args: [JSON.stringify([0.1, 0.2, 0.3, 0.4])],
      });
      embClient.close();

      // Attach and query across DBs
      await attachEmbeddingDatabase(entityClient, embDbPath);

      const result = await entityClient.execute(
        "SELECT e.id, e.content FROM entities e INNER JOIN emb.embeddings emb_t ON e.id = emb_t.entity_id",
      );
      expect(result.rows).toHaveLength(1);
      expect(result.rows[0]?.["id"]).toBe("e1");

      entityClient.close();
    });

    test("vector_distance_cos works across attached DBs", async () => {
      // Create entity DB
      const entityDbPath = join(tempDir, "brain.db");
      const entityClient = createClient({ url: `file:${entityDbPath}` });
      await entityClient.execute(
        "CREATE TABLE IF NOT EXISTS entities (id TEXT PRIMARY KEY, entity_type TEXT)",
      );
      await entityClient.execute("INSERT INTO entities VALUES ('e1', 'post')");

      // Create embedding DB with vector
      const embDbPath = join(tempDir, "embeddings.db");
      const embClient = createClient({ url: `file:${embDbPath}` });
      await embClient.execute(`
        CREATE TABLE IF NOT EXISTS embeddings (
          entity_id TEXT NOT NULL,
          entity_type TEXT NOT NULL,
          embedding F32_BLOB(4) NOT NULL,
          content_hash TEXT NOT NULL,
          PRIMARY KEY(entity_id, entity_type)
        )
      `);
      await embClient.execute({
        sql: "INSERT INTO embeddings VALUES ('e1', 'post', vector32(?), 'hash1')",
        args: [JSON.stringify([0.1, 0.2, 0.3, 0.4])],
      });
      embClient.close();

      // Attach
      await attachEmbeddingDatabase(entityClient, embDbPath);

      // Cross-DB vector distance query
      const queryVec = JSON.stringify([0.15, 0.25, 0.35, 0.45]);
      const result = await entityClient.execute({
        sql: `
          SELECT e.id,
                 vector_distance_cos(emb_t.embedding, vector32(?)) as distance
          FROM entities e
          INNER JOIN emb.embeddings emb_t
            ON e.id = emb_t.entity_id AND e.entity_type = emb_t.entity_type
          WHERE vector_distance_cos(emb_t.embedding, vector32(?)) < 1.0
        `,
        args: [queryVec, queryVec],
      });

      expect(result.rows).toHaveLength(1);
      const distance = result.rows[0]?.["distance"];
      expect(typeof distance).toBe("number");
      expect(distance as number).toBeLessThan(0.1); // Very similar vectors
      entityClient.close();
    });

    test("embedding writes go to separate DB file", async () => {
      const embDbPath = join(tempDir, "embeddings.db");
      const config: EntityDbConfig = { url: `file:${embDbPath}` };
      const { client } = createEmbeddingDatabase(config);

      await client.execute(`
        CREATE TABLE IF NOT EXISTS embeddings (
          entity_id TEXT NOT NULL,
          entity_type TEXT NOT NULL,
          embedding F32_BLOB(4) NOT NULL,
          content_hash TEXT NOT NULL,
          PRIMARY KEY(entity_id, entity_type)
        )
      `);

      await client.execute({
        sql: "INSERT INTO embeddings VALUES ('e1', 'post', vector32(?), 'hash1')",
        args: [JSON.stringify([0.1, 0.2, 0.3, 0.4])],
      });

      // Verify file exists on disk
      expect(existsSync(embDbPath)).toBe(true);

      // Verify data is in the embedding DB
      const result = await client.execute(
        "SELECT count(*) as cnt FROM embeddings",
      );
      expect(result.rows[0]?.["cnt"]).toBe(1);

      client.close();
    });
  });
});
