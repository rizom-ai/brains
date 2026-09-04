import { describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { readdir } from "node:fs/promises";
import { caughtError } from "../src/caught-error";
import { tmpdir } from "node:os";
import {
  createTempDir,
  createTempDirSync,
  createTestDatabase,
  removeTrackedTempDirs,
} from "../src/test-database";

/** Records close() calls so a test can prove cleanup reached every client. */
function fakeClient(): { close: () => void; closed: () => number } {
  let closes = 0;
  return {
    close: (): void => {
      closes += 1;
    },
    closed: (): number => closes,
  };
}

describe("createTestDatabase", () => {
  test("runs the migration against the file url it created", async () => {
    const seen: string[] = [];
    const database = await createTestDatabase({
      prefix: "brain-helper-test-",
      filename: "test.db",
      migrate: async (url) => {
        seen.push(url);
      },
    });

    expect(seen).toEqual([database.url]);
    expect(database.url).toBe(`file:${database.dbPath}`);
    expect(database.dbPath.startsWith(database.dir)).toBe(true);

    await database.cleanup();
  });

  test("places the directory under the system temp dir with the given prefix", async () => {
    const database = await createTestDatabase({
      prefix: "brain-helper-test-",
      filename: "test.db",
      migrate: async () => {},
    });

    expect(database.dir.startsWith(tmpdir())).toBe(true);
    expect(database.dir).toContain("brain-helper-test-");

    await database.cleanup();
  });

  test("cleanup closes every tracked client, then removes the directory", async () => {
    const first = fakeClient();
    const second = fakeClient();

    const database = await createTestDatabase({
      prefix: "brain-helper-test-",
      filename: "test.db",
      migrate: async () => {},
    });
    database.track(first);
    database.track(second);

    await database.cleanup();

    expect(first.closed()).toBe(1);
    expect(second.closed()).toBe(1);
    expect(existsSync(database.dir)).toBe(false);
  });

  test("track returns the client so it can be registered inline", async () => {
    const client = fakeClient();
    const database = await createTestDatabase({
      prefix: "brain-helper-test-",
      filename: "test.db",
      migrate: async () => {},
    });

    expect(database.track(client)).toBe(client);

    await database.cleanup();
  });

  test("cleanup is idempotent and does not close a client twice", async () => {
    const client = fakeClient();
    const database = await createTestDatabase({
      prefix: "brain-helper-test-",
      filename: "test.db",
      migrate: async () => {},
    });
    database.track(client);

    await database.cleanup();
    await database.cleanup();

    expect(client.closed()).toBe(1);
    expect(existsSync(database.dir)).toBe(false);
  });

  test("a failing migration removes the directory and rethrows", async () => {
    const before = await readdir(tmpdir());

    let thrown: unknown;
    try {
      await createTestDatabase({
        prefix: "brain-helper-failing-",
        filename: "test.db",
        migrate: async () => {
          throw new Error("migration exploded");
        },
      });
    } catch (error) {
      thrown = error;
    }

    expect(caughtError(thrown).message).toBe("migration exploded");

    const after = await readdir(tmpdir());
    const leaked = after.filter(
      (entry) =>
        entry.startsWith("brain-helper-failing-") && !before.includes(entry),
    );
    expect(leaked).toEqual([]);
  });
});

describe("createTempDir", () => {
  test("creates a directory under the system temp dir with the given prefix", async () => {
    const dir = await createTempDir("brains-temp-helper-test-");

    expect(existsSync(dir)).toBe(true);
    expect(dir.startsWith(tmpdir())).toBe(true);
    expect(dir).toContain("brains-temp-helper-test-");

    removeTrackedTempDirs();
  });

  test("removes every directory it handed out, sync and async alike", async () => {
    const first = await createTempDir("brains-temp-helper-test-");
    const second = createTempDirSync("brains-temp-helper-test-");

    removeTrackedTempDirs();

    expect(existsSync(first)).toBe(false);
    expect(existsSync(second)).toBe(false);
  });

  test("keeps directories handed out after the last cleanup", async () => {
    const before = await createTempDir("brains-temp-helper-test-");
    removeTrackedTempDirs();
    const after = await createTempDir("brains-temp-helper-test-");

    expect(existsSync(before)).toBe(false);
    expect(existsSync(after)).toBe(true);

    removeTrackedTempDirs();
  });
});
