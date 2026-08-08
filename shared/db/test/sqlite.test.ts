import { describe, expect, it } from "bun:test";
import { createClient } from "@libsql/client";
import { sql } from "drizzle-orm";
import {
  applySqlitePragmas,
  createSqliteDatabase,
  resolveAuthToken,
} from "../src/sqlite";

describe("createSqliteDatabase", () => {
  it("returns a drizzle database, client, and the resolved url", () => {
    const { db, client, url } = createSqliteDatabase({
      url: "file::memory:",
      schema: {},
    });
    expect(url).toBe("file::memory:");
    expect(db).toBeDefined();
    expect(client).toBeDefined();
    client.close();
  });

  it("uses the turso engine for file urls when BRAINS_DB_ENGINE=turso", async () => {
    process.env["BRAINS_DB_ENGINE"] = "turso";
    try {
      const { db, client } = createSqliteDatabase({
        url: "file::memory:",
        schema: {},
      });
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

  it("keeps libsql for remote urls even when BRAINS_DB_ENGINE=turso", () => {
    process.env["BRAINS_DB_ENGINE"] = "turso";
    try {
      const { client } = createSqliteDatabase({
        url: "libsql://example.turso.io",
        schema: {},
        authToken: "token",
      });
      // the libsql remote client reports its protocol; the adapter is file-only
      expect(client.protocol).not.toBe("file");
      client.close();
    } finally {
      delete process.env["BRAINS_DB_ENGINE"];
    }
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

  it("sets the busy timeout before WAL initialization can contend", async () => {
    const executed: string[] = [];
    const contendedClient = {
      execute: async (statement: string): Promise<void> => {
        executed.push(statement);
        if (statement === "PRAGMA journal_mode = WAL") {
          throw new Error("SQLITE_BUSY");
        }
      },
    };

    expect(
      applySqlitePragmas(contendedClient, "file:test.sqlite"),
    ).rejects.toThrow("SQLITE_BUSY");
    expect(executed).toEqual([
      "PRAGMA busy_timeout = 5000",
      "PRAGMA journal_mode = WAL",
    ]);
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
