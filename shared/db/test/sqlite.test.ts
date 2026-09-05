import { describe, expect, it } from "bun:test";
import { sql } from "drizzle-orm";
import { integer, sqliteTable } from "drizzle-orm/sqlite-core";
import { applySqlitePragmas, createSqliteDatabase } from "../src/sqlite";
import { closeSqliteClient } from "../src/turso-client";

function restoreEnvironment(key: string, previous: string | undefined): void {
  if (previous === undefined) delete process.env[key];
  else process.env[key] = previous;
}

describe("createSqliteDatabase", () => {
  it("uses Turso regardless of the retired engine selector", async () => {
    const key = "BRAINS_DB_ENGINE";
    const previous = process.env[key];
    try {
      for (const setting of [undefined, "libsql", "turso"]) {
        restoreEnvironment(key, setting);
        const { db, client, url } = createSqliteDatabase({
          url: "file::memory:",
          schema: {},
        });
        try {
          expect(url).toBe("file::memory:");
          await client.execute("CREATE TABLE t (x INTEGER)");
          await client.execute("INSERT INTO t VALUES (7)");
          expect(await db.all<{ x: number }>(sql`SELECT x FROM t`)).toEqual([
            { x: 7 },
          ]);
          // Native Turso identifies itself independently of any config flag.
          const version = await client.execute(
            "SELECT turso_version() AS version",
          );
          expect(typeof version.rows[0]?.["version"]).toBe("string");
        } finally {
          await closeSqliteClient(client);
        }
      }
    } finally {
      restoreEnvironment(key, previous);
    }
  });

  it("preserves typed Drizzle queries and transaction rollback", async () => {
    const entries = sqliteTable("entries", { id: integer("id").primaryKey() });
    const { db, client } = createSqliteDatabase({
      url: "file::memory:",
      schema: { entries },
    });
    try {
      await client.execute("CREATE TABLE entries (id INTEGER PRIMARY KEY)");
      const failure = await db
        .transaction(async (tx) => {
          await tx.insert(entries).values({ id: 1 });
          throw new Error("abort transaction");
        })
        .then(
          () => undefined,
          (error: unknown) => error,
        );
      expect(failure).toBeInstanceOf(Error);
      expect(await db.query.entries.findMany()).toEqual([]);
      await db.transaction(async (tx) => {
        await tx.insert(entries).values({ id: 2 });
      });
      expect(await db.query.entries.findMany()).toEqual([{ id: 2 }]);
    } finally {
      await closeSqliteClient(client);
    }
  });

  it("rejects local opens in an endpoint-only process", () => {
    const key = "BRAINS_FORBID_LOCAL_DATABASE_OPEN";
    const previous = process.env[key];
    process.env[key] = "1";
    try {
      expect(() =>
        createSqliteDatabase({ url: "file::memory:", schema: {} }),
      ).toThrow(/forbidden in this process/);
    } finally {
      restoreEnvironment(key, previous);
    }
  });

  it("rejects remote URLs without connecting", () => {
    for (const url of [
      "libsql://example.turso.io",
      "https://example.turso.io",
      "wss://example.turso.io",
    ]) {
      expect(() => createSqliteDatabase({ url, schema: {} })).toThrow(
        /only supports file:/,
      );
    }
  });
});

describe("applySqlitePragmas", () => {
  it("enables WAL without relying on Turso's no-op busy timeout", async () => {
    const executed: string[] = [];
    await applySqlitePragmas(
      {
        execute: async (statement) => {
          executed.push(statement);
        },
      },
      "file:test.db",
    );
    expect(executed).toEqual(["PRAGMA journal_mode = WAL"]);
  });

  it("rejects remote URLs before executing a statement", async () => {
    const executed: string[] = [];
    const failure = await applySqlitePragmas(
      {
        execute: async (statement) => {
          executed.push(statement);
        },
      },
      "libsql://example.turso.io",
    ).then(
      () => undefined,
      (error: unknown) => error,
    );
    expect(failure).toBeInstanceOf(Error);
    expect(executed).toEqual([]);
  });
});
