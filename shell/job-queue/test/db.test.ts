import { describe, test, expect, afterEach } from "bun:test";
import { createJobQueueDatabase, enableWALMode } from "../src/db";

describe("JobQueueService Database", () => {
  let cleanup: (() => Promise<void>)[] = [];

  afterEach(async () => {
    // Run all cleanup functions
    for (const fn of cleanup) {
      await fn();
    }
    cleanup = [];
  });

  describe("createJobQueueDatabase", () => {
    test("creates database with explicit config", () => {
      const { db, client, url } = createJobQueueDatabase({
        url: "file::memory:",
      });
      expect(db).toBeDefined();
      expect(client).toBeDefined();
      expect(url).toBe("file::memory:");
      cleanup.push(async () => client.close());
    });

    test("creates database with custom URL", () => {
      const customUrl = "file:./custom-jobs.db";
      const { db, client, url } = createJobQueueDatabase({ url: customUrl });
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
      const { db, client, url } = createJobQueueDatabase(config);
      expect(db).toBeDefined();
      expect(client).toBeDefined();
      expect(url).toBe(config.url);
      cleanup.push(async () => client.close());
    });
  });

  describe("enableWALMode", () => {
    test("handles WAL mode for in-memory database", async () => {
      const { client } = createJobQueueDatabase({ url: "file::memory:" });

      await enableWALMode(client, "file::memory:");

      // Note: WAL mode is not applicable to in-memory databases,
      // they use "memory" journal mode instead
      const result = await client.execute("PRAGMA journal_mode");
      expect(result.rows[0]?.["journal_mode"]).toBe("memory");

      cleanup.push(async () => client.close());
    });

    test("skips WAL mode for remote database", async () => {
      const { client } = createJobQueueDatabase({
        url: "libsql://test.turso.io",
      });

      // Should not throw for remote databases
      await enableWALMode(client, "libsql://test.turso.io");
      // Should complete without error

      cleanup.push(async () => client.close());
    });
  });

  describe("integration", () => {
    test("full database initialization flow", async () => {
      const config = { url: "file::memory:" };

      // Create database
      const { db, client, url } = createJobQueueDatabase(config);
      expect(db).toBeDefined();
      expect(client).toBeDefined();
      expect(url).toBe(config.url);

      // Enable WAL mode
      await enableWALMode(client, url);

      // Create a test table
      await client.execute(`
        CREATE TABLE IF NOT EXISTS job_queue (
          id TEXT PRIMARY KEY,
          type TEXT NOT NULL,
          status TEXT NOT NULL
        )
      `);

      // Verify database is usable
      await client.execute(
        "INSERT INTO job_queue (id, type, status) VALUES (?, ?, ?)",
        ["test-id", "test-type", "pending"],
      );

      const result = await client.execute("SELECT * FROM job_queue");
      expect(result.rows).toHaveLength(1);
      expect(result.rows[0]).toMatchObject({
        id: "test-id",
        type: "test-type",
        status: "pending",
      });

      cleanup.push(async () => client.close());
    });
  });
});
