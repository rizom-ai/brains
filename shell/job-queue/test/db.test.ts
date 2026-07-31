import { describe, test, expect, afterEach } from "bun:test";
import { applySqlitePragmas } from "@brains/db";
import { createJobQueueDatabase } from "../src/db";

describe("JobQueueService Database", () => {
  let cleanup: (() => Promise<void>)[] = [];

  afterEach(async () => {
    for (const fn of cleanup) {
      await fn();
    }
    cleanup = [];
  });

  function trackClient(client: { close(): void }): void {
    cleanup.push(async () => client.close());
  }

  describe("createJobQueueDatabase", () => {
    test("creates database with explicit config", () => {
      const { db, client, url } = createJobQueueDatabase({
        url: "file::memory:",
      });
      expect(db).toBeDefined();
      expect(client).toBeDefined();
      expect(url).toBe("file::memory:");
      trackClient(client);
    });

    test("creates database with custom URL", () => {
      const customUrl = "file:./custom-jobs.db";
      const { db, client, url } = createJobQueueDatabase({ url: customUrl });
      expect(db).toBeDefined();
      expect(client).toBeDefined();
      expect(url).toBe(customUrl);
      trackClient(client);
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
      trackClient(client);
    });
  });

  describe("integration", () => {
    test("full database initialization flow", async () => {
      const config = { url: "file::memory:" };

      const { db, client, url } = createJobQueueDatabase(config);
      expect(db).toBeDefined();
      expect(client).toBeDefined();
      expect(url).toBe(config.url);

      await applySqlitePragmas(client, url);

      await client.execute(`
        CREATE TABLE IF NOT EXISTS job_queue (
          id TEXT PRIMARY KEY,
          type TEXT NOT NULL,
          status TEXT NOT NULL
        )
      `);

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

      trackClient(client);
    });
  });
});
