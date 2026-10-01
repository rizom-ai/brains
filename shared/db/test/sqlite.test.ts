import { describe, expect, it, spyOn } from "bun:test";
import * as libsql from "@libsql/client";
import { createClient, LibsqlError } from "@libsql/client";
import { sql } from "drizzle-orm";
import { setTimeout as sleep } from "node:timers/promises";
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
      let pending: Promise<{ value: libsql.Transaction } | { error: unknown }>;
      try {
        await held.execute("INSERT INTO probe VALUES (1)");
        pending = connection.client.transaction("write").then(
          (value) => ({ value }),
          (error: unknown) => ({ error }),
        );
        await sleep(25);
        await held.execute("INSERT INTO probe VALUES (2)");
        await held.commit();
      } finally {
        held.close();
      }
      const outcome = await pending;
      if ("error" in outcome) throw outcome.error;
      const next = outcome.value;
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

describe("shared transaction acquisition", () => {
  it("retries ordinary Drizzle transactions before entering their callback", async () => {
    await withConnections(async (holder, contender) => {
      const held = await holder.client.transaction("write");
      let callbacks = 0;
      try {
        await held.execute("INSERT INTO probe VALUES (1)");
        const pending = contender.db
          .transaction(async (tx) => {
            callbacks++;
            await tx.run(sql`INSERT INTO probe VALUES (2)`);
            return "committed";
          })
          .then(
            (value) => ({ value }),
            (error: unknown) => ({ error }),
          );
        await sleep(25);
        expect(callbacks).toBe(0);
        await held.commit();
        const outcome = await pending;
        if ("error" in outcome) throw outcome.error;
        expect(outcome.value).toBe("committed");
        expect(callbacks).toBe(1);
        expect(
          (
            await contender.client.execute("SELECT id FROM probe ORDER BY id")
          ).rows.map((row) => row["id"]),
        ).toEqual([1, 2]);
      } finally {
        held.close();
      }
    });
  });

  it("retries acquisition held by another process and joins that process's exit", async () => {
    await withConnections(async (_holder, contender) => {
      let resolveHeld: (() => void) | undefined;
      const held = new Promise<void>((resolve) => {
        resolveHeld = resolve;
      });
      const child = Bun.spawn(
        [
          process.execPath,
          new URL("./fixtures/sqlite-lock-holder.ts", import.meta.url).pathname,
          contender.url,
        ],
        {
          stdout: "ignore",
          stderr: "pipe",
          ipc: (message: unknown): void => {
            if (message === "held") resolveHeld?.();
          },
        },
      );
      const stderr = new Response(child.stderr).text();
      let callbacks = 0;
      try {
        await Promise.race([
          held,
          child.exited.then(async (code) => {
            throw new Error(
              `Lock holder exited before readiness (${code}): ${await stderr}`,
            );
          }),
        ]);
        const pending = contender.db
          .transaction(async (tx) => {
            callbacks++;
            await tx.run(sql`INSERT INTO probe VALUES (2)`);
            return "committed";
          })
          .then(
            (value) => ({ value }),
            (error: unknown) => ({ error }),
          );
        await sleep(25);
        expect(callbacks).toBe(0);
        child.send("release");
        expect(await child.exited).toBe(0);
        const outcome = await pending;
        if ("error" in outcome) throw outcome.error;
        expect(outcome.value).toBe("committed");
        expect(callbacks).toBe(1);
        expect(
          (
            await contender.client.execute("SELECT id FROM probe ORDER BY id")
          ).rows.map((row) => row["id"]),
        ).toEqual([1, 2]);
      } finally {
        if (child.exitCode === null) child.kill("SIGTERM");
        await child.exited;
        await stderr;
      }
    });
  });

  it("does not reopen a client closed during acquisition backoff", async () => {
    await withConnections(async (holder, contender) => {
      const held = await holder.client.transaction("write");
      const reconnect = spyOn(contender.client, "reconnect");
      try {
        const pending = contender.client.transaction("write").then(
          (value) => ({ value }),
          (error: unknown) => ({ error }),
        );
        await sleep(10);
        const resets = reconnect.mock.calls.length;
        expect(resets).toBeGreaterThan(0);
        contender.client.close();
        await held.commit();
        const outcome = await pending;
        expect("error" in outcome).toBe(true);
        if (!("error" in outcome)) {
          outcome.value.close();
          throw new Error("Closed client admitted a transaction");
        }
        expect(outcome.error).toBeInstanceOf(LibsqlError);
        expect(contender.client.closed).toBe(true);
        expect(reconnect.mock.calls.length).toBe(resets);
        await rejects(contender.client.transaction("write"), /CLIENT_CLOSED/);
      } finally {
        held.close();
        reconnect.mockRestore();
      }
    });
  });

  it("does not replay a callback that fails with a native contention code", async () => {
    await withConnections(async (connection) => {
      const refusal = new LibsqlError("callback conflict", "SQLITE_BUSY");
      const reconnect = spyOn(connection.client, "reconnect");
      let callbacks = 0;
      try {
        await rejects(
          connection.db.transaction(async (tx) => {
            callbacks++;
            await tx.run(sql`INSERT INTO probe VALUES (1)`);
            throw refusal;
          }),
          (error) => error === refusal,
        );
        expect(callbacks).toBe(1);
        expect(reconnect).not.toHaveBeenCalled();
        expect(
          (await connection.client.execute("SELECT count(*) AS n FROM probe"))
            .rows[0]?.["n"],
        ).toBe(0);
      } finally {
        reconnect.mockRestore();
      }
    });
  });

  it("does not replay a refused commit or reconnect its admitted transaction", async () => {
    await withConnections(async (connection) => {
      const begin = connection.client.transaction.bind(connection.client);
      const refusal = new LibsqlError("commit conflict", "SQLITE_BUSY");
      const reconnect = spyOn(connection.client, "reconnect");
      let acquisitions = 0;
      let callbacks = 0;
      let commits = 0;
      connection.client.transaction = async (
        mode?: libsql.TransactionMode,
      ): Promise<libsql.Transaction> => {
        acquisitions++;
        const transaction = await begin(mode);
        transaction.commit = async (): Promise<void> => {
          commits++;
          throw refusal;
        };
        return transaction;
      };
      try {
        await rejects(
          connection.db.transaction(async (tx) => {
            callbacks++;
            await tx.run(sql`INSERT INTO probe VALUES (1)`);
          }),
          (error) => error === refusal,
        );
        expect(acquisitions).toBe(1);
        expect(callbacks).toBe(1);
        expect(commits).toBe(1);
        expect(reconnect).not.toHaveBeenCalled();
        expect(
          (await connection.client.execute("SELECT count(*) AS n FROM probe"))
            .rows[0]?.["n"],
        ).toBe(0);
      } finally {
        reconnect.mockRestore();
      }
    });
  });

  it("exhausts the acquisition budget without replacing the refusal", async () => {
    const native = createClient({ url: "file::memory:" });
    const refusal = new LibsqlError("refused begin", "SQLITE_BUSY");
    const begin = spyOn(native, "transaction").mockRejectedValue(refusal);
    const reconnect = spyOn(native, "reconnect");
    const factory = spyOn(libsql, "createClient").mockReturnValue(native);
    const clock = spyOn(Date, "now")
      .mockReturnValueOnce(0)
      .mockReturnValue(2_000);
    try {
      const client = createSqliteClient({ url: "file::memory:" });
      await rejects(client.transaction("write"), (error) => error === refusal);
      expect(begin).toHaveBeenCalledTimes(1);
      expect(reconnect).toHaveBeenCalledTimes(1);
    } finally {
      clock.mockRestore();
      factory.mockRestore();
      begin.mockRestore();
      reconnect.mockRestore();
      native.close();
    }
  });

  it("does not retry or reset a non-contention acquisition refusal", async () => {
    const native = createClient({ url: "file::memory:" });
    const refusal = new LibsqlError("read-only", "SQLITE_READONLY");
    const begin = spyOn(native, "transaction").mockRejectedValue(refusal);
    const reconnect = spyOn(native, "reconnect");
    const factory = spyOn(libsql, "createClient").mockReturnValue(native);
    try {
      const client = createSqliteClient({ url: "file::memory:" });
      await rejects(client.transaction("write"), (error) => error === refusal);
      expect(begin).toHaveBeenCalledTimes(1);
      expect(reconnect).not.toHaveBeenCalled();
    } finally {
      factory.mockRestore();
      begin.mockRestore();
      reconnect.mockRestore();
      native.close();
    }
  });

  it("leaves embedded-replica acquisition and reconnect ownership with the SDK", async () => {
    // Stub the replication primary, not the safety policy: a file URL with
    // syncUrl is a replica and must not be treated as an ordinary local file.
    const native = createClient({ url: "file::memory:" });
    const refusal = new LibsqlError(
      "replica acquisition refused",
      "SQLITE_BUSY",
    );
    const begin = spyOn(native, "transaction").mockRejectedValue(refusal);
    const originalBegin = native.transaction;
    const reconnect = spyOn(native, "reconnect");
    const factory = spyOn(libsql, "createClient").mockReturnValue(native);
    const config = {
      url: "file:/unused-replica.db",
      syncUrl: "libsql://test-primary.invalid",
      authToken: "test-only",
      syncInterval: 60_000,
    };
    try {
      const client = createSqliteClient(config);
      await rejects(client.transaction("write"), (error) => error === refusal);
      expect(client.transaction).toBe(originalBegin);
      expect(begin).toHaveBeenCalledTimes(1);
      expect(reconnect).not.toHaveBeenCalled();
      expect(factory).toHaveBeenCalledWith({ ...config, timeout: 0 });
    } finally {
      factory.mockRestore();
      begin.mockRestore();
      reconnect.mockRestore();
      native.close();
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
      const reconnect = spyOn(contender.client, "reconnect");
      const pending = contender.client.transaction("write").then(
        (value) => ({ value }),
        (error: unknown) => ({ error }),
      );
      const deadline = Date.now() + 1_000;
      const waitForRefusals = async (): Promise<void> => {
        if (reconnect.mock.calls.length >= 3 || Date.now() >= deadline) return;
        await sleep(5);
        return waitForRefusals();
      };
      try {
        await held.execute("INSERT INTO probe VALUES (1)");
        await waitForRefusals();
        expect(reconnect.mock.calls.length).toBeGreaterThanOrEqual(3);
        await held.commit();
      } finally {
        held.close();
        reconnect.mockRestore();
      }
      const outcome = await pending;
      if ("error" in outcome) throw outcome.error;
      const transaction = outcome.value;
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
