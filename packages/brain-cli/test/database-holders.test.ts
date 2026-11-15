import { afterEach, describe, expect, it } from "bun:test";
import { Database } from "bun:sqlite";
import { mkdtemp, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import {
  findDatabaseHolders,
  findProcHolders,
  type FileIdentity,
  type ProcReader,
} from "../src/lib/database-holders";

const directories: string[] = [];

afterEach(async () => {
  await Promise.all(
    directories
      .splice(0)
      .map((path) => rm(path, { recursive: true, force: true })),
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

describe("findProcHolders", () => {
  const owner = 1000;
  const operator = 1001;
  const file = { dev: 7, ino: 42, uid: owner };
  const denied = (): never => {
    throw Object.assign(new Error("EACCES"), { code: "EACCES" });
  };
  const gone = (): never => {
    throw Object.assign(new Error("ENOENT"), { code: "ENOENT" });
  };

  function fakeProc(
    processes: Record<
      string,
      {
        uid: number;
        fds?: Record<string, { dev: number; ino: number }> | "denied" | "gone";
      }
    >,
  ): ProcReader {
    return {
      readdir: async (path): Promise<string[]> => {
        if (path === "/proc") return [...Object.keys(processes), "self", "1x"];
        const pid = path.split("/")[2] ?? "";
        const fds = processes[pid]?.fds;
        if (fds === "denied") return denied();
        if (fds === "gone" || fds === undefined) return gone();
        return Object.keys(fds);
      },
      stat: async (path): Promise<FileIdentity> => {
        const [, , pid = "", , fd] = path.split("/");
        const process = processes[pid];
        if (!process) return gone();
        if (fd === undefined) return { dev: 0, ino: 0, uid: process.uid };
        const fds = process.fds;
        if (typeof fds !== "object") return denied();
        return { ...(fds[fd] ?? gone()), uid: process.uid };
      },
    };
  }

  it("matches open files by identity, whatever path the holder used", async () => {
    const proc = fakeProc({
      "10": { uid: owner, fds: { "3": { dev: 7, ino: 42 } } },
      "11": { uid: owner, fds: { "3": { dev: 7, ino: 43 } } },
    });

    expect(await findProcHolders([file], proc, operator)).toEqual([10]);
  });

  it("cannot confirm when a process running as the database owner is unreadable", async () => {
    const proc = fakeProc({ "20": { uid: owner, fds: "denied" } });

    expect(await findProcHolders([file], proc, operator)).toBeUndefined();
  });

  it("skips non-dumpable processes of the operator's own user", async () => {
    const proc = fakeProc({ "40": { uid: owner, fds: "denied" } });

    expect(await findProcHolders([file], proc, owner)).toEqual([]);
  });

  it("skips unreadable processes of other users and processes that exited", async () => {
    const proc = fakeProc({
      "1": { uid: 0, fds: "denied" },
      "30": { uid: owner, fds: "gone" },
    });

    expect(await findProcHolders([file], proc, operator)).toEqual([]);
  });
});

describe("findDatabaseHolders through a symlink", () => {
  it("finds a holder that opened the database by its real path", async () => {
    const path = await databasePath();
    const linked = join(dirname(dirname(path)), `linked-${Date.now()}`);
    await symlink(dirname(path), linked);
    directories.push(linked);
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

      expect(await findDatabaseHolders(join(linked, "brain.db"))).toEqual([
        holder.pid,
      ]);
    } finally {
      holder.kill();
      await holder.exited;
    }
  });
});
