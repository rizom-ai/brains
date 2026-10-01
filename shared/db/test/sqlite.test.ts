import { describe, expect, it } from "bun:test";
import { createClient } from "@libsql/client";
import { rejects } from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  applySqlitePragmas,
  createSqliteClient,
  createSqliteDatabase,
  resolveAuthToken,
  type SqliteConnection,
} from "../src/sqlite";

async function withConnections(
  test: (
    holder: SqliteConnection,
    contender: SqliteConnection,
  ) => Promise<void>,
): Promise<void> {
  const dir = await mkdtemp(join(tmpdir(), "sqlite-fail-fast-"));
  const url = `file:${join(dir, "db.sqlite")}`;
  const holder = createSqliteDatabase({ url, schema: {} });
  const contender = createSqliteDatabase({ url, schema: {} });
  try {
    await applySqlitePragmas(holder.client, url);
    await applySqlitePragmas(contender.client, url);
    await holder.client.execute("CREATE TABLE probe (id INTEGER PRIMARY KEY)");
    await test(holder, contender);
  } finally {
    contender.client.close();
    holder.client.close();
    await rm(dir, { recursive: true, force: true });
  }
}

async function expectLocalPragmas(connection: SqliteConnection): Promise<void> {
  for (const [pragma, column, expected] of [
    ["busy_timeout", "timeout", 0],
    ["foreign_keys", "foreign_keys", 1],
    ["synchronous", "synchronous", 2],
    ["wal_autocheckpoint", "wal_autocheckpoint", 1000],
    ["journal_mode", "journal_mode", "wal"],
  ] as const) {
    expect(
      (await connection.client.execute(`PRAGMA ${pragma}`)).rows[0]?.[column],
    ).toBe(expected);
  }
}

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
});

describe("createSqliteClient", () => {
  it("does not intercept remote transaction acquisition", () => {
    const client = createSqliteClient({ url: "libsql://example.turso.io" });
    try {
      expect(Object.hasOwn(client, "transaction")).toBe(false);
    } finally {
      client.close();
    }
  });

  it("overrides native busy waiting on initial and reopened local connections", async () => {
    const client = createSqliteClient({ url: "file::memory:", timeout: 2000 });
    try {
      expect(
        (await client.execute("PRAGMA busy_timeout")).rows[0]?.["timeout"],
      ).toBe(0);
      const transaction = await client.transaction("write");
      try {
        await transaction.commit();
      } finally {
        transaction.close();
      }
      expect(
        (await client.execute("PRAGMA busy_timeout")).rows[0]?.["timeout"],
      ).toBe(0);
    } finally {
      client.close();
    }
  });

  it("resets only a refused acquisition connection, not an admitted transaction", async () => {
    await withConnections(async (connection) => {
      const held = await connection.client.transaction("write");
      try {
        await held.execute("INSERT INTO probe VALUES (1)");
        await rejects(connection.client.transaction("write"), /SQLITE_BUSY/);
        await held.execute("INSERT INTO probe VALUES (2)");
        await held.commit();
      } finally {
        held.close();
      }
      const next = await connection.client.transaction("write");
      try {
        await next.execute("INSERT INTO probe VALUES (3)");
        await next.commit();
      } finally {
        next.close();
      }
      expect(
        (
          await connection.client.execute("SELECT id FROM probe ORDER BY id")
        ).rows.map((row) => row["id"]),
      ).toEqual([1, 2, 3]);
    });
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
  it("disables synchronous busy waiting for local files", async () => {
    const client = createClient({ url: "file::memory:" });
    try {
      await applySqlitePragmas(client, "file::memory:");
      expect(
        (await client.execute("PRAGMA busy_timeout")).rows[0]?.["timeout"],
      ).toBe(0);
    } finally {
      client.close();
    }
  });

  it("sets the busy timeout before WAL initialization can contend", async () => {
    const executed: string[] = [];
    const contendedClient = {
      execute: async (statement: string): Promise<void> => {
        executed.push(statement);
        if (statement === "PRAGMA journal_mode = WAL")
          throw new Error("SQLITE_BUSY");
      },
    };
    await rejects(
      applySqlitePragmas(contendedClient, "file:test.sqlite"),
      /SQLITE_BUSY/,
    );
    expect(executed).toEqual([
      "PRAGMA busy_timeout = 0",
      "PRAGMA journal_mode = WAL",
    ]);
  });

  it("fails contending writes promptly while the in-process holder can continue", async () => {
    await withConnections(async (holder, contender) => {
      const transaction = await holder.client.transaction("write");
      try {
        await transaction.execute("INSERT INTO probe VALUES (1)");
        const started = performance.now();
        await rejects(
          contender.client.execute("INSERT INTO probe VALUES (2)"),
          /SQLITE_BUSY/,
        );
        expect(performance.now() - started).toBeLessThan(100);
        await transaction.commit();
        await contender.client.execute("INSERT INTO probe VALUES (2)");
        expect(
          (await contender.client.execute("SELECT count(*) AS n FROM probe"))
            .rows[0]?.["n"],
        ).toBe(2);
      } finally {
        transaction.close();
      }
    });
  }, 10_000);

  it("can commit after repeated refused BEGINs without retaining active native statements", async () => {
    await withConnections(async (holder, contender) => {
      const held = await holder.client.transaction("write");
      try {
        await held.execute("INSERT INTO probe VALUES (1)");
        for (let attempt = 0; attempt < 3; attempt++)
          await rejects(contender.client.transaction("write"), /SQLITE_BUSY/);
        await held.commit();
      } finally {
        held.close();
      }
      const transaction = await contender.client.transaction("write");
      try {
        await transaction.execute("INSERT INTO probe VALUES (2)");
        await transaction.commit();
      } finally {
        transaction.close();
      }
      expect(
        (
          await contender.client.execute("SELECT id FROM probe ORDER BY id")
        ).rows.map((row) => row["id"]),
      ).toEqual([1, 2]);
      await expectLocalPragmas(contender);
    });
  });

  it("keeps reopened connections fail-fast without changing durability or foreign keys", async () => {
    await withConnections(async (connection) => {
      for (let cycle = 0; cycle < 3; cycle++) {
        await expectLocalPragmas(connection);
        const transaction = await connection.client.transaction("write");
        try {
          await transaction.commit();
        } finally {
          transaction.close();
        }
      }
      await Promise.resolve(connection.client.reconnect());
      await expectLocalPragmas(connection);
    });
  });

  it("skips pragmas for remote libsql urls", async () => {
    const executed: string[] = [];
    const recordingClient = {
      execute: async (statement: string): Promise<void> => {
        executed.push(statement);
      },
    };
    await applySqlitePragmas(recordingClient, "libsql://example.turso.io");
    expect(executed).toEqual([]);
  });
});
