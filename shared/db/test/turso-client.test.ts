import { afterEach, describe, expect, it } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Client } from "@libsql/client";
import { createTursoClient } from "../src/turso-client";

const tempDirs: string[] = [];

function tempDbPath(name: string): string {
  const dir = mkdtempSync(join(tmpdir(), "turso-client-test-"));
  tempDirs.push(dir);
  return join(dir, name);
}

afterEach(() => {
  tempDirs.splice(0).forEach((dir) => {
    rmSync(dir, { recursive: true, force: true });
  });
});

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

describe("createTursoClient attach", () => {
  it("attaches a second database file for cross-db queries", async () => {
    const embPath = tempDbPath("emb.db");
    const emb = createTursoClient({ url: `file:${embPath}` });
    await emb.execute("CREATE TABLE t (x INTEGER)");
    await emb.execute("INSERT INTO t VALUES (42)");
    emb.close();

    const main = createTursoClient({ url: "file::memory:" });
    try {
      await main.execute(`ATTACH DATABASE '${embPath}' AS emb`);
      const rs = await main.execute("SELECT x FROM emb.t");
      expect(rs.rows[0]?.["x"]).toBe(42);
    } finally {
      main.close();
    }
  });
});
