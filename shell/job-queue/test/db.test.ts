import { describe, test, expect, afterEach } from "bun:test";
import { mkdtemp, rm } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { createJobQueueDatabase, enableWALMode } from "../src/db";

describe("JobQueueService Database", () => {
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

  describe("createJobQueueDatabase", () => {
    test("creates database with default config", async () => {
      // Create temp dir for the test database
      tempDir = await mkdtemp(join(tmpdir(), "job-queue-db-test-"));
      const testDbPath = join(tempDir, "brain-jobs.db");
      
      const { db, client, url } = createJobQueueDatabase({ url: `file:${testDbPath}` });
      expect(db).toBeDefined();
      expect(client).toBeDefined();
      expect(url).toBe(`file:${testDbPath}`);
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
    test("enables WAL mode for local file database", async () => {
      tempDir = await mkdtemp(join(tmpdir(), "job-queue-db-test-"));
      const dbPath = join(tempDir, "test-jobs.db");
      const { client } = createJobQueueDatabase({ url: `file:${dbPath}` });

      await enableWALMode(client, `file:${dbPath}`);

      // Check that WAL mode is enabled
      const result = await client.execute("PRAGMA journal_mode");
      expect(result.rows[0]?.["journal_mode"]).toBe("wal");

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
      tempDir = await mkdtemp(join(tmpdir(), "job-queue-db-test-"));
      const dbPath = join(tempDir, "test-jobs.db");
      const config = { url: `file:${dbPath}` };

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
