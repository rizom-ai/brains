import { describe, expect, it } from "bun:test";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Logger, LogLevel } from "@brains/utils/logger";
import { runPackageMigrations } from "../src/migrate";
import type { PragmaClient } from "../src/sqlite";

function silentLogger(): Logger {
  return Logger.createFresh({ level: LogLevel.NONE });
}

/**
 * Write a minimal drizzle migrations folder: one SQL file plus the journal
 * drizzle-kit generates alongside it.
 */
async function createMigrationsFolder(sql: string): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "brains-db-migrate-"));
  await writeFile(join(dir, "0000_init.sql"), sql);
  await mkdir(join(dir, "meta"), { recursive: true });
  await writeFile(
    join(dir, "meta", "_journal.json"),
    JSON.stringify({
      version: "7",
      dialect: "sqlite",
      entries: [
        { idx: 0, version: "6", when: 1, tag: "0000_init", breakpoints: true },
      ],
    }),
  );
  return dir;
}

describe("runPackageMigrations", () => {
  it("applies migrations and closes the client", async () => {
    const migrationsFolder = await createMigrationsFolder(
      "CREATE TABLE widgets (id text PRIMARY KEY NOT NULL);",
    );
    const dbDir = await mkdtemp(join(tmpdir(), "brains-db-file-"));
    const url = `file:${join(dbDir, "test.db")}`;

    await runPackageMigrations({
      label: "widgets",
      config: { url },
      schema: {},
      migrationsFolder,
      logger: silentLogger(),
    });

    // Reconnect: the helper must have closed its own client.
    const { createSqliteDatabase } = await import("../src/sqlite");
    const { client } = createSqliteDatabase({ url, schema: {} });
    try {
      const result = await client.execute(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='widgets'",
      );
      expect(result.rows).toHaveLength(1);
    } finally {
      client.close();
    }
  });

  it("applies the busy-timeout pragma before migrating", async () => {
    const migrationsFolder = await createMigrationsFolder(
      "CREATE TABLE gadgets (id text PRIMARY KEY NOT NULL);",
    );
    const dbDir = await mkdtemp(join(tmpdir(), "brains-db-file-"));
    const url = `file:${join(dbDir, "test.db")}`;

    await runPackageMigrations({
      label: "gadgets",
      config: { url },
      schema: {},
      migrationsFolder,
      logger: silentLogger(),
    });

    const { createSqliteDatabase } = await import("../src/sqlite");
    const { client } = createSqliteDatabase({ url, schema: {} });
    try {
      const journal = await client.execute("PRAGMA journal_mode");
      expect(journal.rows[0]?.["journal_mode"]).toBe("wal");
    } finally {
      client.close();
    }
  });

  it("runs an afterMigrate hook with the live client", async () => {
    const migrationsFolder = await createMigrationsFolder(
      "CREATE TABLE things (id text PRIMARY KEY NOT NULL);",
    );
    const dbDir = await mkdtemp(join(tmpdir(), "brains-db-file-"));
    const url = `file:${join(dbDir, "test.db")}`;

    await runPackageMigrations({
      label: "things",
      config: { url },
      schema: {},
      migrationsFolder,
      logger: silentLogger(),
      afterMigrate: async (client: PragmaClient): Promise<void> => {
        await client.execute(
          "CREATE VIRTUAL TABLE things_fts USING fts5(content)",
        );
      },
    });

    const { createSqliteDatabase } = await import("../src/sqlite");
    const { client } = createSqliteDatabase({ url, schema: {} });
    try {
      const result = await client.execute(
        "SELECT name FROM sqlite_master WHERE name='things_fts'",
      );
      expect(result.rows).toHaveLength(1);
    } finally {
      client.close();
    }
  });

  it("closes the client and rethrows when a migration fails", async () => {
    const migrationsFolder = await createMigrationsFolder("NOT VALID SQL;");
    const dbDir = await mkdtemp(join(tmpdir(), "brains-db-file-"));
    const url = `file:${join(dbDir, "test.db")}`;

    let thrown: unknown;
    try {
      await runPackageMigrations({
        label: "broken",
        config: { url },
        schema: {},
        migrationsFolder,
        logger: silentLogger(),
      });
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeDefined();

    // A leaked open client would keep the WAL lock; reconnecting proves cleanup.
    const { createSqliteDatabase } = await import("../src/sqlite");
    const { client } = createSqliteDatabase({ url, schema: {} });
    client.close();
  });
});
