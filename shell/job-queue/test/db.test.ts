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
    test("creates database with default config", () => {
      const { db, client, url } = createJobQueueDatabase();
      expect(db).toBeDefined();
      expect(client).toBeDefined();
      expect(url).toBe("file:./brain-jobs.db");
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

    test("uses environment variables when no config provided", () => {
      const originalUrl = process.env["JOB_QUEUE_DATABASE_URL"];
      const originalToken = process.env["JOB_QUEUE_DATABASE_AUTH_TOKEN"];

      process.env["JOB_QUEUE_DATABASE_URL"] = "file:./env-test-jobs.db";
      process.env["JOB_QUEUE_DATABASE_AUTH_TOKEN"] = "env-token";

      const { db, client, url } = createJobQueueDatabase();
      expect(db).toBeDefined();
      expect(client).toBeDefined();
      expect(url).toBe("file:./env-test-jobs.db");

      cleanup.push(async () => {
        client.close();
        // Restore env vars
        if (originalUrl !== undefined) {
          process.env["JOB_QUEUE_DATABASE_URL"] = originalUrl;
        } else {
          delete process.env["JOB_QUEUE_DATABASE_URL"];
        }
        if (originalToken !== undefined) {
          process.env["JOB_QUEUE_DATABASE_AUTH_TOKEN"] = originalToken;
        } else {
          delete process.env["JOB_QUEUE_DATABASE_AUTH_TOKEN"];
        }
      });
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
