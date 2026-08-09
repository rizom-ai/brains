import { describe, expect, it } from "bun:test";
import { createClient } from "@libsql/client";
import { sql } from "drizzle-orm";
import {
  applySqlitePragmas,
  createSqliteDatabase,
  resolveAuthToken,
} from "../src/sqlite";
import { dropTursoIndexForFallback } from "../src/turso-maintenance";

describe("createSqliteDatabase", () => {
  it("returns a drizzle database, client, and the resolved url", () => {
    const { db, client, url, engine } = createSqliteDatabase({
      url: "file::memory:",
      schema: {},
    });
    expect(url).toBe("file::memory:");
    expect(engine).toBe(
      process.env["BRAINS_DB_ENGINE"] === "turso" ? "turso" : "libsql",
    );
    expect(db).toBeDefined();
    expect(client).toBeDefined();
    client.close();
  });

  it("uses the turso engine for file urls when BRAINS_DB_ENGINE=turso", async () => {
    process.env["BRAINS_DB_ENGINE"] = "turso";
    try {
      const { db, client, engine } = createSqliteDatabase({
        url: "file::memory:",
        schema: {},
      });
      expect(engine).toBe("turso");
      // the turso file client is distinguishable by its unsupported sync()
      expect(client.sync()).rejects.toThrow(/turso/);
      await client.execute("CREATE TABLE t (x INTEGER)");
      await client.execute("INSERT INTO t VALUES (7)");
      const rows = await db.all<{ x: number }>(sql`SELECT x FROM t`);
      expect(rows).toEqual([{ x: 7 }]);
      client.close();
    } finally {
      delete process.env["BRAINS_DB_ENGINE"];
    }
  });

  it("lets an explicit engine override the environment", () => {
    process.env["BRAINS_DB_ENGINE"] = "turso";
    try {
      const { client, engine } = createSqliteDatabase({
        url: "file::memory:",
        schema: {},
        engine: "libsql",
      });
      expect(engine).toBe("libsql");
      client.close();
    } finally {
      delete process.env["BRAINS_DB_ENGINE"];
    }
  });

  it("rejects the embedded Turso engine for remote urls", () => {
    expect(() =>
      createSqliteDatabase({
        url: "libsql://example.turso.io",
        schema: {},
        engine: "turso",
      }),
    ).toThrow(/only supports file:/);
  });

  it("keeps libsql for remote urls even when BRAINS_DB_ENGINE=turso", () => {
    process.env["BRAINS_DB_ENGINE"] = "turso";
    try {
      const { client, engine } = createSqliteDatabase({
        url: "libsql://example.turso.io",
        schema: {},
        authToken: "token",
      });
      expect(engine).toBe("libsql");
      // the libsql remote client reports its protocol; the adapter is file-only
      expect(client.protocol).not.toBe("file");
      client.close();
    } finally {
      delete process.env["BRAINS_DB_ENGINE"];
    }
  });
});

describe("dropTursoIndexForFallback", () => {
  it("rejects remote urls", () => {
    expect(
      dropTursoIndexForFallback("libsql://example.turso.io", "safe_index"),
    ).rejects.toThrow(/only supports file:/);
  });

  it("rejects unsafe index names", () => {
    expect(
      dropTursoIndexForFallback("file::memory:", "index; DROP TABLE data"),
    ).rejects.toThrow(/Unsafe SQLite index name/);
  });
});

describe("resolveAuthToken", () => {
  it("prefers an explicit token over the environment fallback", () => {
    const key = "BRAINS_DB_TEST_TOKEN";
    process.env[key] = "env-token";
    try {
      expect(
        resolveAuthToken({ authToken: "explicit-token", authTokenEnv: key }),
      ).toBe("explicit-token");
    } finally {
      delete process.env[key];
    }
  });

  it("reads the token from the named environment variable", () => {
    const key = "BRAINS_DB_TEST_TOKEN";
    process.env[key] = "env-token";
    try {
      expect(resolveAuthToken({ authTokenEnv: key })).toBe("env-token");
    } finally {
      delete process.env[key];
    }
  });

  it("returns undefined when neither source provides a token", () => {
    expect(
      resolveAuthToken({ authTokenEnv: "BRAINS_DB_TEST_TOKEN_UNSET" }),
    ).toBeUndefined();
    expect(resolveAuthToken({})).toBeUndefined();
  });
});

describe("applySqlitePragmas", () => {
  it("enables WAL journaling and a busy timeout for local files", async () => {
    const client = createClient({ url: "file::memory:" });
    try {
      await applySqlitePragmas(client, "file::memory:");
      const busyTimeout = await client.execute("PRAGMA busy_timeout");
      expect(busyTimeout.rows[0]?.["timeout"]).toBe(5000);
    } finally {
      client.close();
    }
  });

  it("skips pragmas for remote libsql urls", async () => {
    const executed: string[] = [];
    const client = createClient({ url: "file::memory:" });
    const recordingClient = {
      execute: async (statement: string): Promise<void> => {
        executed.push(statement);
      },
    };
    try {
      await applySqlitePragmas(recordingClient, "libsql://example.turso.io");
      expect(executed).toEqual([]);
    } finally {
      client.close();
    }
  });
});
