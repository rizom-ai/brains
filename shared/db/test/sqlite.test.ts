import { describe, expect, it } from "bun:test";
import { createClient } from "@libsql/client";
import { sql } from "drizzle-orm";
import {
  applySqlitePragmas,
  createSqliteDatabase,
  resolveAuthToken,
} from "../src/sqlite";

function restoreDatabaseEngine(previousEngine: string | undefined): void {
  if (previousEngine === undefined) {
    delete process.env["BRAINS_DB_ENGINE"];
  } else {
    process.env["BRAINS_DB_ENGINE"] = previousEngine;
  }
}

describe("createSqliteDatabase", () => {
  it("defaults local file urls to libsql", async () => {
    const previousEngine = process.env["BRAINS_DB_ENGINE"];
    delete process.env["BRAINS_DB_ENGINE"];
    try {
      const { db, client, url, engine } = createSqliteDatabase({
        url: "file::memory:",
        schema: {},
      });
      expect(url).toBe("file::memory:");
      expect(engine).toBe("libsql");
      expect(db).toBeDefined();
      expect(client).toBeDefined();
      await client.execute("SELECT 1");
      client.close();
    } finally {
      restoreDatabaseEngine(previousEngine);
    }
  });

  it("uses the turso engine for file urls when BRAINS_DB_ENGINE=turso", async () => {
    const previousEngine = process.env["BRAINS_DB_ENGINE"];
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
      restoreDatabaseEngine(previousEngine);
    }
  });

  it("uses libsql as the explicit file fallback", () => {
    const previousEngine = process.env["BRAINS_DB_ENGINE"];
    process.env["BRAINS_DB_ENGINE"] = "libsql";
    try {
      const { client, engine } = createSqliteDatabase({
        url: "file::memory:",
        schema: {},
      });
      expect(engine).toBe("libsql");
      client.close();
    } finally {
      restoreDatabaseEngine(previousEngine);
    }
  });

  it("lets an explicit engine override the environment", () => {
    const previousEngine = process.env["BRAINS_DB_ENGINE"];
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
      restoreDatabaseEngine(previousEngine);
    }
  });

  it("rejects local opens when the process is fenced to the database owner", () => {
    const key = "BRAINS_FORBID_LOCAL_DATABASE_OPEN";
    const previous = process.env[key];
    process.env[key] = "1";
    try {
      expect(() =>
        createSqliteDatabase({ url: "file::memory:", schema: {} }),
      ).toThrow(/forbidden in this process/);
    } finally {
      if (previous === undefined) delete process.env[key];
      else process.env[key] = previous;
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
    const previousEngine = process.env["BRAINS_DB_ENGINE"];
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
      restoreDatabaseEngine(previousEngine);
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
