import { describe, expect, it } from "bun:test";
import { createSqliteDatabase, type SqliteConnection } from "@brains/db";
import { sql } from "drizzle-orm";
import type { TransactionMode, Transaction } from "@libsql/client";
import { rejects } from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { ProjectionTransactionRunner } from "../src/projection-transaction-runner";

async function withConnections(
  test: (first: SqliteConnection, second: SqliteConnection) => Promise<void>,
): Promise<void> {
  const dir = await mkdtemp(
    join(tmpdir(), "projection-transaction-contention-"),
  );
  const url = `file:${join(dir, "db.sqlite")}`;
  const first = createSqliteDatabase({ url, schema: {} });
  const second = createSqliteDatabase({ url, schema: {} });
  try {
    // Isolate acquisition retry from the pragma regression in @brains/db's tests.
    for (const connection of [first, second]) {
      await connection.client.execute("PRAGMA busy_timeout = 0");
      await connection.client.execute("PRAGMA journal_mode = WAL");
    }
    await first.client.execute("CREATE TABLE probe (id INTEGER PRIMARY KEY)");
    await test(first, second);
  } finally {
    second.client.close();
    first.client.close();
    await rm(dir, { recursive: true, force: true });
  }
}

describe("ProjectionTransactionRunner contention", () => {
  it("retries BEGIN IMMEDIATE asynchronously and commits after the holder finishes", async () => {
    await withConnections(async (holder, contender) => {
      const transaction = await holder.client.transaction("write");
      const runner = new ProjectionTransactionRunner(contender.db);
      let calls = 0;
      const begin = contender.client.transaction.bind(contender.client);
      let attempts = 0;
      contender.client.transaction = async (
        mode?: TransactionMode,
      ): Promise<Transaction> => {
        attempts++;
        return begin(mode);
      };
      try {
        await transaction.execute("INSERT INTO probe VALUES (1)");
        const pending = runner
          .run(async (tx) => {
            calls++;
            await tx.run(sql`INSERT INTO probe VALUES (2)`);
            return "committed";
          })
          .then(
            (value) => ({ value }),
            (error: unknown) => ({ error }),
          );
        await sleep(25);
        expect(calls).toBe(0);
        await transaction.commit();
        const result = await pending;
        if ("error" in result) throw result.error;
        expect(result.value).toBe("committed");
        expect(calls).toBe(1);
        // One Drizzle acquisition; its shared client owns the BEGIN retries.
        expect(attempts).toBe(1);
        expect(
          (
            await contender.client.execute("SELECT id FROM probe ORDER BY id")
          ).rows.map((row) => row["id"]),
        ).toEqual([1, 2]);
      } finally {
        transaction.close();
      }
    });
  });

  it("does not replay a started callback when its write fails with SQLITE_BUSY", async () => {
    await withConnections(async (connection) => {
      const runner = new ProjectionTransactionRunner(connection.db);
      const refusal = new Error("SQLITE_BUSY: injected callback refusal");
      let calls = 0;
      await rejects(
        runner.run(async (tx) => {
          calls++;
          await tx.run(sql`INSERT INTO probe VALUES (1)`);
          throw refusal;
        }),
        (error: unknown) => error === refusal,
      );
      expect(calls).toBe(1);
      expect(
        (await connection.client.execute("SELECT count(*) AS n FROM probe"))
          .rows[0]?.["n"],
      ).toBe(0);
      await runner.run(async (tx) => {
        await tx.run(sql`INSERT INTO probe VALUES (2)`);
      });
      expect(
        (await connection.client.execute("SELECT id FROM probe")).rows[0]?.[
          "id"
        ],
      ).toBe(2);
    });
  });

  it("does not replay after a commit refusal and preserves its error", async () => {
    await withConnections(async (connection) => {
      const runner = new ProjectionTransactionRunner(connection.db);
      const refusal = new Error("SQLITE_BUSY: injected commit refusal");
      const begin = connection.client.transaction.bind(connection.client);
      let attempts = 0;
      let callbacks = 0;
      let commits = 0;
      connection.client.transaction = async (
        mode?: TransactionMode,
      ): Promise<Transaction> => {
        attempts++;
        const transaction = await begin(mode);
        transaction.commit = async (): Promise<void> => {
          commits++;
          throw refusal;
        };
        return transaction;
      };
      await rejects(
        runner.run(async (tx) => {
          callbacks++;
          await tx.run(sql`INSERT INTO probe VALUES (1)`);
        }),
        (error: unknown) => error === refusal,
      );
      expect(attempts).toBe(1);
      expect(callbacks).toBe(1);
      expect(commits).toBe(1);
      expect(
        (await connection.client.execute("SELECT count(*) AS n FROM probe"))
          .rows[0]?.["n"],
      ).toBe(0);
    });
  });

  it("does not retry a non-contention BEGIN failure or enter its callback", async () => {
    await withConnections(async (connection) => {
      const refusal = new Error("database admission unavailable");
      let attempts = 0;
      let callbacks = 0;
      connection.client.transaction = async (): Promise<Transaction> => {
        attempts++;
        throw refusal;
      };
      const runner = new ProjectionTransactionRunner(connection.db);
      await rejects(
        runner.run(async () => {
          callbacks++;
        }),
        (error: unknown) => error === refusal,
      );
      expect(attempts).toBe(1);
      expect(callbacks).toBe(0);
    });
  });
});
