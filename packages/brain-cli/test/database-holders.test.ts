import { afterEach, describe, expect, it } from "bun:test";
import { Database } from "bun:sqlite";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { findDatabaseHolders } from "../src/lib/database-holders";

const directories: string[] = [];

afterEach(async () => {
  await Promise.all(
    directories.splice(0).map((path) => rm(path, { recursive: true })),
  );
});

async function databasePath(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), "database-holders-"));
  directories.push(directory);
  const path = join(directory, "brain.db");
  const database = new Database(path, { create: true });
  database.run("PRAGMA journal_mode = WAL");
  database.run("CREATE TABLE t (id INTEGER PRIMARY KEY)");
  database.close(false);
  return path;
}

describe("findDatabaseHolders", () => {
  it("finds another process holding the database open, and none once it exits", async () => {
    const path = await databasePath();
    const holder = Bun.spawn(
      [
        process.execPath,
        "-e",
        `const { Database } = require("bun:sqlite");
const db = new Database(${JSON.stringify(path)});
db.query("SELECT count(*) FROM t").get();
console.log("open");
await Bun.sleep(10000);`,
      ],
      { stdout: "pipe" },
    );
    try {
      await holder.stdout.getReader().read();

      expect(await findDatabaseHolders(path)).toEqual([holder.pid]);
    } finally {
      holder.kill();
      await holder.exited;
    }

    expect(await findDatabaseHolders(path)).toEqual([]);
  });

  it("ignores this process's own handles", async () => {
    const path = await databasePath();
    const own = new Database(path);
    try {
      own.query("SELECT count(*) FROM t").get();

      expect(await findDatabaseHolders(path)).toEqual([]);
    } finally {
      own.close(false);
    }
  });
});
