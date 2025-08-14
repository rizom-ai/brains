import { describe, test, expect, afterEach } from "bun:test";
import {
  createEntityDatabase,
  enableWALModeForEntities,
  ensureEntityIndexes,
} from "../src/db";

describe("EntityService Database", () => {
  let cleanup: (() => Promise<void>)[] = [];

  afterEach(async () => {
    // Run all cleanup functions
    for (const fn of cleanup) {
      await fn();
    }
    cleanup = [];
  });

  describe("createEntityDatabase", () => {
    test("creates database with explicit config", () => {
      const { db, client, url } = createEntityDatabase({
        url: "file::memory:",
      });
      expect(db).toBeDefined();
      expect(client).toBeDefined();
      expect(url).toBe("file::memory:");
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
  });

  describe("enableWALModeForEntities", () => {
    test("handles WAL mode for in-memory database", async () => {
      const { client } = createEntityDatabase({ url: "file::memory:" });

      await enableWALModeForEntities(client, "file::memory:");

      // Note: WAL mode is not applicable to in-memory databases,
      // they use "memory" journal mode instead
      const result = await client.execute("PRAGMA journal_mode");
      expect(result.rows[0]?.["journal_mode"]).toBe("memory");

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
      const { client } = createEntityDatabase({ url: "file::memory:" });

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
      const config = { url: "file::memory:" };

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
