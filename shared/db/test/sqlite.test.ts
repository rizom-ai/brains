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
  contenderOptions: { contentionRetryBudgetMs?: number } = {},
): Promise<void> {
  const dir = await mkdtemp(join(tmpdir(), "sqlite-fail-fast-"));
  const url = `file:${join(dir, "db.sqlite")}`;
  const holder = createSqliteDatabase({ url, schema: {} });
  const contender = createSqliteDatabase({
    url,
    schema: {},
    ...contenderOptions,
  });
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

/** Ids another connection reads: only what a writer actually committed. */
async function committedIds(url: string): Promise<unknown[]> {
  const reader = createClient({ url });
  try {
    return (await reader.execute("SELECT id FROM probe ORDER BY id")).rows.map(
      (row) => row["id"],
    );
  } finally {
    reader.close();
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
      expect(await committedIds(connection.url)).toEqual([1, 2, 3]);
    });
  });
});

describe("applySqlitePragmas under contention", () => {
  it("waits out a brief lock instead of failing the connection", async () => {
    const dir = await mkdtemp(join(tmpdir(), "sqlite-pragma-contention-"));
    const url = `file:${join(dir, "db.sqlite")}`;
    // A database still in rollback mode needs an exclusive lock to enter WAL,
    // which another connection's write transaction refuses.
    const holder = createSqliteClient({ url });
    const opener = createSqliteClient({ url });
    try {
      await holder.execute("CREATE TABLE probe (id INTEGER PRIMARY KEY)");
      const held = await holder.transaction("write");
      try {
        await held.execute("INSERT INTO probe VALUES (1)");
        const pragmas = applySqlitePragmas(opener, url).then(
          () => ({ ok: true as const }),
          (error: unknown) => ({ ok: false as const, error }),
        );
        await sleep(50);
        await held.commit();
        const outcome = await pragmas;
        if (!outcome.ok) throw outcome.error;
      } finally {
        held.close();
      }
      expect(
        (await opener.execute("PRAGMA journal_mode")).rows[0]?.["journal_mode"],
      ).toBe("wal");
    } finally {
      opener.close();
      holder.close();
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("still reports a lock held past the retry budget", async () => {
    const dir = await mkdtemp(join(tmpdir(), "sqlite-pragma-contention-"));
    const url = `file:${join(dir, "db.sqlite")}`;
    const holder = createSqliteClient({ url });
    const opener = createSqliteClient({ url });
    try {
      await holder.execute("CREATE TABLE probe (id INTEGER PRIMARY KEY)");
      const held = await holder.transaction("write");
      try {
        await held.execute("INSERT INTO probe VALUES (1)");
        const started = Date.now();
        await rejects(applySqlitePragmas(opener, url), (error: unknown) => {
          expect(error instanceof LibsqlError && error.code).toMatch(
            /^SQLITE_(BUSY|LOCKED)$/u,
          );
          return true;
        });
        // One budget for every pragma, not one each: two full budgets ran
        // into this test's own timeout.
        expect(Date.now() - started).toBeLessThan(7_000);
      } finally {
        held.close();
      }
    } finally {
      opener.close();
      holder.close();
      await rm(dir, { recursive: true, force: true });
    }
  }, 10_000);
});

describe("local client contention contract", () => {
  // Every way a local client can need a write lock waits out a briefly held
  // one asynchronously; nothing may reach SQLite around that policy.
  const RETRIED = ["execute", "batch", "migrate", "transaction"] as const;
  // A script runs without a transaction, so a refusal partway through could
  // leave it half applied; the rest take no lock.
  const NOT_RETRIED = ["executeMultiple", "sync", "close", "reconnect"];

  function clientMethods(client: object): string[] {
    const own = Object.keys(client).filter(
      (key) => typeof Reflect.get(client, key) === "function",
    );
    const inherited = Object.getOwnPropertyNames(
      Object.getPrototypeOf(client),
    ).filter(
      (key) =>
        key !== "constructor" && typeof Reflect.get(client, key) === "function",
    );
    return [...new Set([...own, ...inherited])].sort();
  }

  it("classifies every method of a local client", async () => {
    const dir = await mkdtemp(join(tmpdir(), "sqlite-contract-"));
    const client = createSqliteClient({
      url: `file:${join(dir, "db.sqlite")}`,
    });
    try {
      expect(clientMethods(client)).toEqual(
        [...RETRIED, ...NOT_RETRIED].sort(),
      );
    } finally {
      client.close();
      await rm(dir, { recursive: true, force: true });
    }
  });

  const writes: Record<
    (typeof RETRIED)[number],
    (contender: SqliteConnection) => Promise<unknown>
  > = {
    execute: (contender) =>
      contender.client.execute("INSERT INTO probe VALUES (2)"),
    batch: (contender) =>
      contender.client.batch(["INSERT INTO probe VALUES (2)"], "write"),
    migrate: (contender) =>
      contender.client.migrate([
        { sql: "INSERT INTO probe VALUES (2)", args: [] },
      ]),
    transaction: async (contender) => {
      const tx = await contender.client.transaction("write");
      try {
        await tx.execute("INSERT INTO probe VALUES (2)");
        await tx.commit();
      } finally {
        tx.close();
      }
    },
  };

  for (const method of RETRIED) {
    it(`${method} waits out a briefly held write lock and applies once`, async () => {
      await withConnections(async (holder, contender) => {
        const held = await holder.client.transaction("write");
        try {
          await held.execute("INSERT INTO probe VALUES (1)");
          const pending = writes[method](contender).then(
            () => ({ ok: true as const }),
            (error: unknown) => ({ ok: false as const, error }),
          );
          await sleep(50);
          await held.commit();
          const outcome = await pending;
          if (!outcome.ok) throw outcome.error;
        } finally {
          held.close();
        }
        expect(await committedIds(contender.url)).toEqual([1, 2]);
      });
    });
  }

  it("waits out a held lock for a standalone drizzle upsert", async () => {
    await withConnections(async (holder, contender) => {
      const held = await holder.client.transaction("write");
      try {
        await held.execute("INSERT INTO probe VALUES (1)");
        // The shape of the embedding write that failed in production.
        const pending = contender.db
          .run(
            sql`INSERT INTO probe VALUES (2) ON CONFLICT (id) DO UPDATE SET id = excluded.id`,
          )
          .then(
            () => ({ ok: true as const }),
            (error: unknown) => ({ ok: false as const, error }),
          );
        await sleep(50);
        await held.commit();
        expect(await pending).toEqual({ ok: true });
      } finally {
        held.close();
      }
      expect(await committedIds(contender.url)).toEqual([1, 2]);
    });
  });

  it("does not retry a statement inside an open transaction", async () => {
    await withConnections(async (holder, contender) => {
      await holder.client.execute("INSERT INTO probe VALUES (1)");
      const reader = await contender.client.transaction("read");
      try {
        await reader.execute("SELECT id FROM probe");
        const held = await holder.client.transaction("write");
        try {
          await held.execute("INSERT INTO probe VALUES (2)");
          const started = Date.now();
          await rejects(
            reader.execute("INSERT INTO probe VALUES (3)"),
            (error: unknown) =>
              error instanceof LibsqlError &&
              /^SQLITE_(BUSY|LOCKED|READONLY)/u.test(error.code),
          );
          expect(Date.now() - started).toBeLessThan(500);
        } finally {
          held.close();
        }
      } finally {
        reader.close();
      }
    });
  });

  it("waits out a lock another process holds for a standalone write", async () => {
    // Production shape: the web and worker processes write the same files.
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
          .run(
            sql`INSERT INTO probe VALUES (2) ON CONFLICT (id) DO UPDATE SET id = excluded.id`,
          )
          .then(
            () => ({ ok: true as const }),
            (error: unknown) => ({ ok: false as const, error }),
          );
        await sleep(25);
        child.send("release");
        expect(await child.exited).toBe(0);
        const outcome = await pending;
        if (!outcome.ok) throw outcome.error;
        expect(await committedIds(contender.url)).toEqual([1, 2]);
      } finally {
        if (child.exitCode === null) child.kill("SIGTERM");
        await child.exited;
        await stderr;
      }
    });
  });

  it("waits as long as the native busy timeout it replaced", async () => {
    // Before writes waited asynchronously, SQLite itself waited up to 5 s.
    await withConnections(async (holder, contender) => {
      const held = await holder.client.transaction("write");
      try {
        await held.execute("INSERT INTO probe VALUES (1)");
        const pending = contender.client
          .execute("INSERT INTO probe VALUES (2)")
          .then(
            () => ({ ok: true as const }),
            (error: unknown) => ({ ok: false as const, error }),
          );
        await sleep(2_500);
        await held.commit();
        const outcome = await pending;
        if (!outcome.ok) throw outcome.error;
      } finally {
        held.close();
      }
    });
  }, 10_000);

  for (const method of RETRIED) {
    it(`${method} refuses at once for an owner without a budget, and recovers`, async () => {
      await withConnections(
        async (holder, contender) => {
          const held = await holder.client.transaction("write");
          try {
            await held.execute("INSERT INTO probe VALUES (1)");
            const started = Date.now();
            await rejects(
              writes[method](contender),
              (error: unknown) =>
                error instanceof LibsqlError &&
                /^SQLITE_(BUSY|LOCKED)$/u.test(error.code),
            );
            expect(Date.now() - started).toBeLessThan(500);
            await held.commit();
          } finally {
            held.close();
          }
          await writes[method](contender);
          expect(await committedIds(contender.url)).toEqual([1, 2]);
        },
        { contentionRetryBudgetMs: 0 },
      );
    });
  }

  for (const budget of [undefined, 0]) {
    it(`commits every later write after a refused standalone write (budget ${budget ?? "default"})`, async () => {
      // A refused statement once left its connection inside a transaction:
      // later writes looked applied to their own connection, were never
      // committed, and vanished when the connection was reopened.
      await withConnections(
        async (holder, contender) => {
          const held = await holder.client.transaction("write");
          try {
            await held.execute("INSERT INTO probe VALUES (1)");
            const pending = contender.client
              .execute("INSERT INTO probe VALUES (2)")
              .then(
                () => ({ ok: true as const }),
                (error: unknown) => ({ ok: false as const, error }),
              );
            await sleep(50);
            await held.commit();
            const outcome = await pending;
            if (!outcome.ok)
              await contender.client.execute("INSERT INTO probe VALUES (2)");
          } finally {
            held.close();
          }
          await contender.client.execute("INSERT INTO probe VALUES (3)");
          expect(await committedIds(contender.url)).toEqual([1, 2, 3]);
        },
        budget === undefined ? {} : { contentionRetryBudgetMs: budget },
      );
    });
  }

  it("still reports a standalone write refused past the retry budget", async () => {
    await withConnections(async (holder, contender) => {
      const held = await holder.client.transaction("write");
      try {
        await held.execute("INSERT INTO probe VALUES (1)");
        await rejects(
          contender.client.execute("INSERT INTO probe VALUES (2)"),
          (error: unknown) =>
            error instanceof LibsqlError &&
            /^SQLITE_(BUSY|LOCKED)$/u.test(error.code),
        );
      } finally {
        held.close();
      }
    });
  }, 10_000);
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
        expect(await committedIds(contender.url)).toEqual([1, 2]);
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
        expect(await committedIds(contender.url)).toEqual([1, 2]);
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
      .mockReturnValue(5_000);
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

  it("waits out a contending write without blocking the in-process holder", async () => {
    await withConnections(async (holder, contender) => {
      const transaction = await holder.client.transaction("write");
      try {
        await transaction.execute("INSERT INTO probe VALUES (1)");
        let landed = false;
        const pending = contender.client
          .execute("INSERT INTO probe VALUES (2)")
          .then(() => {
            landed = true;
          });
        // A native busy wait would hold this thread until it gave up; the
        // holder must be able to carry on while the write waits its turn.
        const started = performance.now();
        await transaction.execute("INSERT INTO probe VALUES (3)");
        expect(performance.now() - started).toBeLessThan(100);
        expect(landed).toBe(false);
        await transaction.commit();
        await pending;
        expect(
          (await contender.client.execute("SELECT count(*) AS n FROM probe"))
            .rows[0]?.["n"],
        ).toBe(3);
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
      expect(await committedIds(contender.url)).toEqual([1, 2]);
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
