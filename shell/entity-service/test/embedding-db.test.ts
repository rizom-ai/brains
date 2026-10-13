import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { existsSync } from "node:fs";
import { createClient } from "@libsql/client";
import { z } from "@brains/utils/zod";
import {
  createEmbeddingDatabase,
  migrateEmbeddingDatabase,
  attachEmbeddingDatabase,
} from "../src/db/embedding-db";
import type { EntityDbConfig } from "../src/types";
import { setupEntityService } from "./helpers/setup-entity-service";

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

      await migrateEmbeddingDatabase(client, 1536);

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

  describe("unused vector-index retirement", () => {
    test("drops an existing index without changing vectors, cosine search or other indexes", async () => {
      const { client } = createEmbeddingDatabase({
        url: `file:${join(tempDir, "legacy.db")}`,
      });
      try {
        await migrateEmbeddingDatabase(client, 4);
        await client.execute(
          "CREATE INDEX embeddings_embedding_idx ON embeddings(libsql_vector_idx(embedding))",
        );
        await client.execute(
          "CREATE INDEX embedding_hash_lookup ON embeddings(content_hash)",
        );
        await client.executeMultiple(`
          INSERT INTO embeddings VALUES ('nearest', 'post', vector32('[1,0,0,0]'), 'hash-nearest');
          INSERT INTO embeddings VALUES ('further', 'post', vector32('[1,1,0,0]'), 'hash-further');
          INSERT INTO embeddings VALUES ('opposite', 'post', vector32('[-1,0,0,0]'), 'hash-opposite');
        `);
        const inventorySql =
          "SELECT entity_id, entity_type, hex(embedding) AS bytes, content_hash FROM embeddings ORDER BY entity_id";
        const searchSql =
          "SELECT entity_id, vector_distance_cos(embedding, vector32('[1,0,0,0]')) AS distance FROM embeddings ORDER BY distance, entity_id";
        const inventory = await client.execute(inventorySql);
        const ranking = await client.execute(searchSql);
        expect(ranking.rows.map((row) => row["entity_id"])).toEqual([
          "nearest",
          "further",
          "opposite",
        ]);
        expect(
          (
            await client.execute(
              "SELECT name FROM sqlite_master WHERE name = 'embeddings_embedding_idx'",
            )
          ).rows,
        ).toHaveLength(1);

        await migrateEmbeddingDatabase(client, 4);
        await migrateEmbeddingDatabase(client, 4);

        expect(
          (
            await client.execute(
              "SELECT name FROM sqlite_master WHERE name = 'embeddings_embedding_idx'",
            )
          ).rows,
        ).toHaveLength(0);
        expect(
          (
            await client.execute(
              "SELECT name FROM sqlite_master WHERE type = 'index' AND name = 'embedding_hash_lookup'",
            )
          ).rows,
        ).toHaveLength(1);
        expect((await client.execute(inventorySql)).rows).toEqual(
          inventory.rows,
        );
        expect((await client.execute(searchSql)).rows).toEqual(ranking.rows);
        expect(
          (await client.execute("PRAGMA index_list(embeddings)")).rows.filter(
            (row) => row["origin"] === "pk",
          ),
        ).toHaveLength(1);
        await client.execute(
          "INSERT INTO embeddings VALUES ('new', 'post', vector32('[0,1,0,0]'), 'hash-new')",
        );
        expect(
          (await client.execute("SELECT count(*) AS n FROM embeddings"))
            .rows[0]?.["n"],
        ).toBe(4);
      } finally {
        client.close();
      }
    });

    test("never creates the unused index for fresh or reopened databases", async () => {
      const config: EntityDbConfig = {
        url: `file:${join(tempDir, "fresh.db")}`,
      };
      for (let startup = 0; startup < 2; startup++) {
        const { client } = createEmbeddingDatabase(config);
        try {
          await migrateEmbeddingDatabase(client, 4);
          expect(
            (
              await client.execute(
                "SELECT name FROM sqlite_master WHERE name = 'embeddings_embedding_idx'",
              )
            ).rows,
          ).toHaveLength(0);
        } finally {
          client.close();
        }
      }
    });

    test("does not recreate the index during actual EntityService initialization", async () => {
      const context = await setupEntityService([]);
      const { client } = createEmbeddingDatabase(context.embeddingDbConfig);
      try {
        // An existing installation may still have the former vector index.
        await client.execute(
          "CREATE INDEX IF NOT EXISTS embeddings_embedding_idx ON embeddings(libsql_vector_idx(embedding))",
        );
        await context.entityService.initialize();
        expect(
          (
            await client.execute(
              "SELECT name FROM sqlite_master WHERE name = 'embeddings_embedding_idx'",
            )
          ).rows,
        ).toHaveLength(0);
      } finally {
        client.close();
        context.entityService.close();
        await context.cleanup();
      }
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
      // Very similar vectors
      expect(z.number().parse(distance)).toBeLessThan(0.1);
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
