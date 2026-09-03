import { describe, expect, it } from "bun:test";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createClient, type Client } from "@libsql/client";
import { closeSqliteClient, createTursoClient } from "../src/turso-client";

async function createSeededClient(): Promise<Client> {
  const client = createTursoClient({ url: "file::memory:" });
  await client.execute(
    "CREATE TABLE books (id INTEGER PRIMARY KEY, name TEXT, year INTEGER)",
  );
  await client.execute({
    sql: "INSERT INTO books (name, year) VALUES (?, ?)",
    args: ["Pride and Prejudice", 1813],
  });
  return client;
}

describe("createTursoClient execute", () => {
  it("executes a plain string statement and returns rows", async () => {
    const client = await createSeededClient();
    try {
      const rs = await client.execute("SELECT name, year FROM books");
      expect(rs.rows.length).toBe(1);
      expect(rs.columns).toEqual(["name", "year"]);
    } finally {
      client.close();
    }
  });

  it("supports positional and named arguments", async () => {
    const client = await createSeededClient();
    try {
      const positional = await client.execute({
        sql: "SELECT name FROM books WHERE year = ?",
        args: [1813],
      });
      expect(positional.rows[0]?.["name"]).toBe("Pride and Prejudice");

      const named = await client.execute({
        sql: "SELECT name FROM books WHERE year = $year",
        args: { year: 1813 },
      });
      expect(named.rows[0]?.["name"]).toBe("Pride and Prejudice");
    } finally {
      client.close();
    }
  });

  it("returns hybrid rows with named and positional access", async () => {
    const client = await createSeededClient();
    try {
      const rs = await client.execute("SELECT name, year FROM books");
      const row = rs.rows[0];
      if (!row) throw new Error("expected a row");

      expect(row["name"]).toBe("Pride and Prejudice");
      expect(row[0]).toBe("Pride and Prejudice");
      expect(row[1]).toBe(1813);
      expect(row.length).toBe(2);

      // drizzle's mapResultRow slices rows positionally
      expect(Array.prototype.slice.call(row)).toEqual([
        "Pride and Prejudice",
        1813,
      ]);
      // drizzle's normalizeRow keeps only enumerable (named) properties
      expect(Object.keys(row)).toEqual(["name", "year"]);
    } finally {
      client.close();
    }
  });

  it("reports rowsAffected and lastInsertRowid for writes", async () => {
    const client = await createSeededClient();
    try {
      const rs = await client.execute({
        sql: "INSERT INTO books (name, year) VALUES (?, ?)",
        args: ["Emma", 1815],
      });
      expect(rs.rowsAffected).toBe(1);
      expect(rs.lastInsertRowid).toBe(2n);
    } finally {
      client.close();
    }
  });
});

describe("createTursoClient batch and migrate", () => {
  it("applies a batch atomically and rolls back on failure", async () => {
    const client = await createSeededClient();
    try {
      expect(
        client.batch([
          {
            sql: "INSERT INTO books (name, year) VALUES (?, ?)",
            args: ["Persuasion", 1817],
          },
          "INSERT INTO no_such_table (x) VALUES (1)",
        ]),
      ).rejects.toThrow();

      const rs = await client.execute("SELECT count(*) AS n FROM books");
      expect(rs.rows[0]?.["n"]).toBe(1);
    } finally {
      client.close();
    }
  });

  it("runs migrate statements in order", async () => {
    const client = createTursoClient({ url: "file::memory:" });
    try {
      await client.migrate([
        "CREATE TABLE m (id INTEGER PRIMARY KEY, v TEXT)",
        { sql: "INSERT INTO m (v) VALUES (?)", args: ["a"] },
      ]);
      const rs = await client.execute("SELECT v FROM m");
      expect(rs.rows[0]?.["v"]).toBe("a");
    } finally {
      client.close();
    }
  });

  it("executes multi-statement SQL via executeMultiple", async () => {
    const client = createTursoClient({ url: "file::memory:" });
    try {
      await client.executeMultiple(
        "CREATE TABLE a (x INTEGER); CREATE TABLE b (y INTEGER); INSERT INTO a VALUES (1);",
      );
      const rs = await client.execute("SELECT x FROM a");
      expect(rs.rows[0]?.["x"]).toBe(1);
    } finally {
      client.close();
    }
  });
});

describe("createTursoClient transactions", () => {
  it("commits an interactive transaction", async () => {
    const client = await createSeededClient();
    try {
      const txn = await client.transaction("write");
      await txn.execute({
        sql: "INSERT INTO books (name, year) VALUES (?, ?)",
        args: ["Emma", 1815],
      });
      await txn.commit();
      const rs = await client.execute("SELECT count(*) AS n FROM books");
      expect(rs.rows[0]?.["n"]).toBe(2);
    } finally {
      client.close();
    }
  });

  it("rolls back an interactive transaction", async () => {
    const client = await createSeededClient();
    try {
      const txn = await client.transaction("write");
      await txn.execute({
        sql: "INSERT INTO books (name, year) VALUES (?, ?)",
        args: ["Emma", 1815],
      });
      await txn.rollback();
      const rs = await client.execute("SELECT count(*) AS n FROM books");
      expect(rs.rows[0]?.["n"]).toBe(1);
    } finally {
      client.close();
    }
  });

  it("holds top-level operations until an interactive transaction settles", async () => {
    const client = await createSeededClient();
    try {
      const txn = await client.transaction("write");
      await txn.execute(
        "INSERT INTO books (name, year) VALUES ('rolled back', 2000)",
      );
      const queued = client.execute(
        "INSERT INTO books (name, year) VALUES ('after rollback', 2001)",
      );

      await txn.rollback();
      await queued;

      const rs = await client.execute("SELECT name FROM books ORDER BY id");
      expect(rs.rows.map((row) => row["name"])).toEqual([
        "Pride and Prejudice",
        "after rollback",
      ]);
    } finally {
      client.close();
    }
  });

  it("rolls back a transaction whose deferred constraint fails at commit", async () => {
    const client = createTursoClient({ url: "file::memory:" });
    try {
      await client.execute("PRAGMA foreign_keys = ON");
      await client.execute("CREATE TABLE parents (id INTEGER PRIMARY KEY)");
      await client.execute(
        "CREATE TABLE children (parent_id INTEGER, FOREIGN KEY (parent_id) REFERENCES parents(id) DEFERRABLE INITIALLY DEFERRED)",
      );

      const txn = await client.transaction("write");
      await txn.execute("INSERT INTO children VALUES (99)");
      let commitError: unknown;
      try {
        await Promise.resolve().then(() => txn.commit());
      } catch (error) {
        commitError = error;
      }
      expect(commitError).toBeInstanceOf(Error);

      const rows = await client.execute("SELECT count(*) AS n FROM children");
      expect(rows.rows[0]?.["n"]).toBe(0);
      const next = await client.transaction("write");
      await next.execute("INSERT INTO parents VALUES (99)");
      await next.commit();
    } finally {
      await closeSqliteClient(client);
    }
  });
});

describe("createTursoClient close", () => {
  it("rejects use after close with CLIENT_CLOSED like libsql", async () => {
    const client = await createSeededClient();
    client.close();
    expect(client.closed).toBe(true);
    expect(client.execute("SELECT 1")).rejects.toThrow(/CLIENT_CLOSED/);
    expect(client.batch(["SELECT 1"])).rejects.toThrow(/CLIENT_CLOSED/);
    expect(client.transaction("write")).rejects.toThrow(/CLIENT_CLOSED/);
    expect(client.executeMultiple("SELECT 1")).rejects.toThrow(/CLIENT_CLOSED/);
  });

  it("drains operations admitted before close", async () => {
    const directory = await mkdtemp(join(tmpdir(), "turso-close-drain-"));
    const url = `file:${join(directory, "drain.db")}`;
    const writer = createTursoClient({ url });
    try {
      await writer.execute("CREATE TABLE durable (value TEXT NOT NULL)");
      const transaction = await writer.transaction("write");
      const queued = writer.execute("INSERT INTO durable VALUES ('queued')");
      const closing = closeSqliteClient(writer);

      await transaction.rollback();
      await queued;
      await closing;

      const reader = createClient({ url });
      try {
        const result = await reader.execute("SELECT value FROM durable");
        expect(result.rows[0]?.["value"]).toBe("queued");
      } finally {
        await closeSqliteClient(reader);
      }
    } finally {
      if (!writer.closed) await closeSqliteClient(writer);
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("awaits durable file close before a replacement client opens", async () => {
    const directory = await mkdtemp(join(tmpdir(), "turso-close-"));
    const url = `file:${join(directory, "durable.db")}`;
    const writer = createTursoClient({ url });
    try {
      await writer.execute("CREATE TABLE durable (value TEXT NOT NULL)");
      await writer.execute("INSERT INTO durable VALUES ('committed')");
      await closeSqliteClient(writer);

      const reader = createTursoClient({ url });
      try {
        const result = await reader.execute("SELECT value FROM durable");
        expect(result.rows[0]?.["value"]).toBe("committed");
      } finally {
        await closeSqliteClient(reader);
      }
    } finally {
      if (!writer.closed) await closeSqliteClient(writer);
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("leaves a durably closed Turso file readable by libSQL", async () => {
    const directory = await mkdtemp(join(tmpdir(), "turso-libsql-handoff-"));
    const url = `file:${join(directory, "handoff.db")}`;
    const writer = createTursoClient({ url });
    try {
      await writer.execute("CREATE TABLE durable (value TEXT NOT NULL)");
      await writer.execute("INSERT INTO durable VALUES ('committed')");
      await closeSqliteClient(writer);
      expect(await readdir(directory)).toContain("handoff.db");

      const reader = createClient({ url });
      try {
        const result = await reader.execute("SELECT value FROM durable");
        expect(result.rows[0]?.["value"]).toBe("committed");
      } finally {
        await closeSqliteClient(reader);
      }
    } finally {
      if (!writer.closed) await closeSqliteClient(writer);
      await rm(directory, { recursive: true, force: true });
    }
  });
});

describe("createTursoClient vector support", () => {
  it("round-trips embeddings through vector32 and vector_distance_cos", async () => {
    const client = createTursoClient({ url: "file::memory:" });
    try {
      await client.execute(
        "CREATE TABLE embeddings (id TEXT PRIMARY KEY, embedding F32_BLOB(4) NOT NULL)",
      );
      await client.execute({
        sql: "INSERT INTO embeddings VALUES ('e1', vector32(?))",
        args: [JSON.stringify([0.1, 0.2, 0.3, 0.4])],
      });
      const rs = await client.execute({
        sql: "SELECT vector_distance_cos(embedding, vector32(?)) AS d FROM embeddings",
        args: [JSON.stringify([0.1, 0.2, 0.3, 0.4])],
      });
      const distance = rs.rows[0]?.["d"];
      if (typeof distance !== "number") throw new Error("expected a distance");
      expect(distance).toBeLessThan(1e-6);
    } finally {
      client.close();
    }
  });
});
