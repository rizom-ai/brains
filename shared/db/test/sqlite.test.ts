import { describe, expect, it, spyOn } from "bun:test";
import { sql } from "drizzle-orm";
import { integer, sqliteTable } from "drizzle-orm/sqlite-core";
import { applySqlitePragmas, createSqliteDatabase } from "../src/sqlite";
import { closeSqliteClient } from "../src/turso-client";
import { SqlWorkerClient } from "../src/turso-worker/sql-client";
import { WorkerBinaryPersistence } from "../src/turso-worker/binary-persistence";
import assert from "node:assert/strict";

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
          expect(client).toBeInstanceOf(SqlWorkerClient);
          await client.execute("CREATE TABLE t (x INTEGER)");
          await client.execute("INSERT INTO t VALUES (7)");
          const execute = spyOn(client, "execute");
          expect(await db.all<{ x: number }>(sql`SELECT x FROM t`)).toEqual([
            { x: 7 },
          ]);
          expect(execute).toHaveBeenCalledTimes(1);
          execute.mockRestore();
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

  it("shares staging admission across connections and joins binary retirement with client close", async () => {
    const assets = sqliteTable("assets", { id: integer("id").primaryKey() });
    const first = createSqliteDatabase({
      url: "file::memory:",
      schema: { assets },
    });
    const second = createSqliteDatabase({
      url: "file::memory:",
      schema: { assets },
    });
    assert.ok(first.binary instanceof WorkerBinaryPersistence);
    assert.ok(second.binary instanceof WorkerBinaryPersistence);
    const context = {
      signal: new AbortController().signal,
      connectionSignal: new AbortController().signal,
    };
    try {
      await first.binary.offer(context, 100 * 1024 * 1024);
      await assert.rejects(
        second.binary.offer(context, 1),
        /capacity exceeded/,
      );
      await closeSqliteClient(first.client);
      expect(first.binary.closed).toBe(true);
      const next = await second.binary.offer(context, 100 * 1024 * 1024);
      await second.binary.cancel(context, next.ticket);
      expect(second.binary.stats()).toEqual({ admissions: 0, tickets: 0 });
    } finally {
      await Promise.all([
        closeSqliteClient(first.client),
        closeSqliteClient(second.client),
      ]);
    }
    expect(second.binary.closed).toBe(true);
  });

  it("fences SQL and new transactions before waiting for binary retirement", async () => {
    const assets = sqliteTable("assets", { id: integer("id").primaryKey() });
    const { client, db, binary } = createSqliteDatabase({
      url: "file::memory:",
      schema: { assets },
    });
    assert.ok(binary instanceof WorkerBinaryPersistence);
    const gate = Promise.withResolvers<void>();
    const retire = binary.close.bind(binary);
    const close = spyOn(binary, "close").mockImplementation(async () => {
      await gate.promise;
      await retire();
    });
    let entered = false;
    try {
      await client.execute("SELECT 1");
      const closing = closeSqliteClient(client);
      expect(client.closed).toBe(true);
      await assert.rejects(client.execute("SELECT 1"), /driver is closed/);
      await assert.rejects(db.all(sql`SELECT 1`));
      await assert.rejects(
        db.transaction(async () => {
          entered = true;
        }),
        /driver is closed/,
      );
      expect(entered).toBe(false);
      expect(binary.closed).toBe(false);
      gate.resolve();
      await closing;
      expect(binary.closed).toBe(true);
    } finally {
      gate.resolve();
      await closeSqliteClient(client);
      close.mockRestore();
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
