import { describe, test, expect, afterEach } from "bun:test";
import { applySqlitePragmas } from "@brains/db";
import { createEntityDatabase } from "../src/db";

describe("EntityService Database", () => {
  const clients: Array<{ close: () => void }> = [];

  afterEach(async () => {
    for (const client of clients) {
      client.close();
    }
    clients.length = 0;
  });

  function trackClient(client: { close: () => void }): void {
    clients.push(client);
  }

  describe("createEntityDatabase", () => {
    test("creates database with explicit config", () => {
      const { db, client, url } = createEntityDatabase({
        url: "file::memory:",
      });
      trackClient(client);
      expect(db).toBeDefined();
      expect(client).toBeDefined();
      expect(url).toBe("file::memory:");
    });

    test("creates database with custom URL", () => {
      const customUrl = "file:./custom.db";
      const { db, client, url } = createEntityDatabase({ url: customUrl });
      trackClient(client);
      expect(db).toBeDefined();
      expect(client).toBeDefined();
      expect(url).toBe(customUrl);
    });

    test("creates database with auth token", () => {
      const config = {
        url: "libsql://test.turso.io",
        authToken: "test-token",
      };
      const { db, client, url } = createEntityDatabase(config);
      trackClient(client);
      expect(db).toBeDefined();
      expect(client).toBeDefined();
      expect(url).toBe(config.url);
    });
  });

  describe("integration", () => {
    test("full database initialization flow", async () => {
      const config = { url: "file::memory:" };

      const { db, client, url } = createEntityDatabase(config);
      trackClient(client);
      expect(db).toBeDefined();
      expect(client).toBeDefined();
      expect(url).toBe(config.url);

      await applySqlitePragmas(client, url);

      await client.execute(`
        CREATE TABLE IF NOT EXISTS entities (
          id TEXT NOT NULL,
          entityType TEXT NOT NULL,
          PRIMARY KEY (id, entityType)
        )
      `);

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
    });
  });
});
