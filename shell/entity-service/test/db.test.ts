import { describe, test, expect, afterEach } from "bun:test";
import { mkdtemp, rm } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import {
  createEntityDatabase,
  enableWALModeForEntities,
  ensureEntityIndexes,
} from "../src/db";

describe("EntityService Database", () => {
  let tempDir: string;
  let cleanup: (() => Promise<void>)[] = [];

  afterEach(async () => {
    // Run all cleanup functions
    for (const fn of cleanup) {
      await fn();
    }
    cleanup = [];

    // Remove temp directory if it exists
    if (tempDir) {
      await rm(tempDir, { recursive: true, force: true }).catch(() => {});
    }
  });

  describe("createEntityDatabase", () => {
    test("creates database with default config", () => {
      const { db, client, url } = createEntityDatabase();
      expect(db).toBeDefined();
      expect(client).toBeDefined();
      expect(url).toBe("file:./brain.db");
      cleanup.push(async () => client.close());
    });

    test("creates database with custom URL", () => {
      const customUrl = "file:./custom.db";
      const { db, client, url } = createEntityDatabase({ url: customUrl });
      expect(db).toBeDefined();
      expect(client).toBeDefined();
      expect(url).toBe(customUrl);
      cleanup.push(async () => client.close());
    });

    test("creates database with auth token", () => {
      const config = {
        url: "libsql://test.turso.io",
        authToken: "test-token",
      };
      const { db, client, url } = createEntityDatabase(config);
      expect(db).toBeDefined();
      expect(client).toBeDefined();
      expect(url).toBe(config.url);
      cleanup.push(async () => client.close());
    });

    test("uses environment variables when no config provided", () => {
      const originalUrl = process.env["DATABASE_URL"];
      const originalToken = process.env["DATABASE_AUTH_TOKEN"];

      process.env["DATABASE_URL"] = "file:./env-test.db";
      process.env["DATABASE_AUTH_TOKEN"] = "env-token";

      const { db, client, url } = createEntityDatabase();
      expect(db).toBeDefined();
      expect(client).toBeDefined();
      expect(url).toBe("file:./env-test.db");

      cleanup.push(async () => {
        client.close();
        // Restore env vars
        if (originalUrl !== undefined) {
          process.env["DATABASE_URL"] = originalUrl;
        } else {
          delete process.env["DATABASE_URL"];
        }
        if (originalToken !== undefined) {
          process.env["DATABASE_AUTH_TOKEN"] = originalToken;
        } else {
          delete process.env["DATABASE_AUTH_TOKEN"];
        }
      });
    });
  });

  describe("enableWALModeForEntities", () => {
    test("enables WAL mode for local file database", async () => {
      tempDir = await mkdtemp(join(tmpdir(), "entity-db-test-"));
      const dbPath = join(tempDir, "test.db");
      const { client } = createEntityDatabase({ url: `file:${dbPath}` });

      await enableWALModeForEntities(client, `file:${dbPath}`);

      // Check that WAL mode is enabled
      const result = await client.execute("PRAGMA journal_mode");
      expect(result.rows[0]?.["journal_mode"]).toBe("wal");

      cleanup.push(async () => client.close());
    });

    test("skips WAL mode for remote database", async () => {
      const { client } = createEntityDatabase({
        url: "libsql://test.turso.io",
      });

      // Should not throw for remote databases
      await enableWALModeForEntities(client, "libsql://test.turso.io");
      // Should complete without error

      cleanup.push(async () => client.close());
    });
  });

  describe("ensureEntityIndexes", () => {
    test("creates vector index without error", async () => {
      tempDir = await mkdtemp(join(tmpdir(), "entity-db-test-"));
      const dbPath = join(tempDir, "test.db");
      const { client } = createEntityDatabase({ url: `file:${dbPath}` });

      // Create the entities table first with proper vector column
      // Note: vector columns require special syntax in libSQL
      await client.execute(`
        CREATE TABLE IF NOT EXISTS entities (
          id TEXT NOT NULL,
          entityType TEXT NOT NULL,
          embedding F32_BLOB(1536),
          PRIMARY KEY (id, entityType)
        )
      `);

      // Should not throw even if vector indexes aren't supported
      await ensureEntityIndexes(client);
      // Should complete without error

      cleanup.push(async () => client.close());
    });
  });

  describe("integration", () => {
    test("full database initialization flow", async () => {
      tempDir = await mkdtemp(join(tmpdir(), "entity-db-test-"));
      const dbPath = join(tempDir, "test.db");
      const config = { url: `file:${dbPath}` };

      // Create database
      const { db, client, url } = createEntityDatabase(config);
      expect(db).toBeDefined();
      expect(client).toBeDefined();
      expect(url).toBe(config.url);

      // Enable WAL mode
      await enableWALModeForEntities(client, url);

      // Create a test table with proper vector column
      await client.execute(`
        CREATE TABLE IF NOT EXISTS entities (
          id TEXT NOT NULL,
          entityType TEXT NOT NULL,
          embedding F32_BLOB(1536),
          PRIMARY KEY (id, entityType)
        )
      `);

      // Ensure indexes
      await ensureEntityIndexes(client);

      // Verify database is usable
      await client.execute(
        "INSERT INTO entities (id, entityType) VALUES (?, ?)",
        ["test-id", "test-type"],
      );

      const result = await client.execute("SELECT * FROM entities");
      expect(result.rows).toHaveLength(1);
      expect(result.rows[0]).toMatchObject({
        id: "test-id",
        entityType: "test-type",
      });

      cleanup.push(async () => client.close());
    });
  });
});
