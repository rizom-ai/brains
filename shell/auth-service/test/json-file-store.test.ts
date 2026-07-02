import { afterEach, describe, expect, it } from "bun:test";
import {
  chmod,
  mkdtemp,
  readFile,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { JsonFileStore } from "../src/json-file-store";

interface TestStoreFile {
  entries: string[];
}

function parseTestStore(value: unknown): TestStoreFile {
  if (!value || typeof value !== "object") return { entries: [] };
  const entries = (value as { entries?: unknown }).entries;
  if (!Array.isArray(entries)) return { entries: [] };
  return { entries: entries.filter((entry) => typeof entry === "string") };
}

async function fileExists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

const tempDirs: string[] = [];

async function tempStorageDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "brains-json-file-store-"));
  tempDirs.push(dir);
  return dir;
}

interface CreateStoreOptions {
  parse?: (value: unknown) => TestStoreFile;
  logError?: (message: string, cause: unknown) => void;
  onCorrupt?: "quarantine" | "throw";
}

async function createStore(
  options: CreateStoreOptions = {},
): Promise<{ store: JsonFileStore<TestStoreFile>; filePath: string }> {
  const filePath = join(await tempStorageDir(), "store.json");
  const store = new JsonFileStore<TestStoreFile>({
    filePath,
    parse: options.parse ?? parseTestStore,
    empty: (): TestStoreFile => ({ entries: [] }),
    ...(options.logError ? { logError: options.logError } : {}),
    ...(options.onCorrupt ? { onCorrupt: options.onCorrupt } : {}),
  });
  return { store, filePath };
}

afterEach(async () => {
  await Promise.all(
    tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })),
  );
});

describe("JsonFileStore", () => {
  it("returns the empty store when the file does not exist", async () => {
    const { store } = await createStore();
    expect(await store.read()).toEqual({ entries: [] });
  });

  it("round-trips written content through the parse hook", async () => {
    const { store } = await createStore();
    await store.write({ entries: ["one", "two"] });
    expect(await store.read()).toEqual({ entries: ["one", "two"] });
  });

  it("writes with 0600 permissions and creates missing directories", async () => {
    const dir = await tempStorageDir();
    const filePath = join(dir, "nested", "store.json");
    const store = new JsonFileStore<TestStoreFile>({
      filePath,
      parse: parseTestStore,
      empty: (): TestStoreFile => ({ entries: [] }),
    });

    await store.write({ entries: ["one"] });

    const stats = await stat(filePath);
    expect(stats.mode & 0o777).toBe(0o600);
  });

  it("replaces the file atomically instead of writing in place", async () => {
    const { store, filePath } = await createStore();
    await store.write({ entries: ["old"] });

    // An in-place write would fail EACCES on a read-only file; an atomic
    // tmp-file + rename only needs directory permissions.
    await chmod(filePath, 0o400);
    await store.write({ entries: ["new"] });

    expect(await store.read()).toEqual({ entries: ["new"] });
    expect(await stat(filePath).then((stats) => stats.mode & 0o777)).toBe(
      0o600,
    );
    expect(await fileExists(`${filePath}.tmp`)).toBe(false);
  });

  it("quarantines a corrupt file and starts empty instead of failing", async () => {
    const errors: string[] = [];
    const { store, filePath } = await createStore({
      logError: (message) => errors.push(message),
    });
    await writeFile(filePath, "{ not json", "utf8");

    expect(await store.read()).toEqual({ entries: [] });

    const corruptPath = `${filePath}.corrupt-${process.pid}`;
    expect(await readFile(corruptPath, "utf8")).toBe("{ not json");
    expect(await fileExists(filePath)).toBe(false);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain(corruptPath);

    // The store keeps working after quarantine.
    await store.write({ entries: ["fresh"] });
    expect(await store.read()).toEqual({ entries: ["fresh"] });
  });

  it("quarantines the file when the parse hook throws", async () => {
    const errors: string[] = [];
    const { store, filePath } = await createStore({
      parse: () => {
        throw new Error("schema violation");
      },
      logError: (message) => errors.push(message),
    });
    await writeFile(filePath, `{"entries":[]}`, "utf8");

    expect(await store.read()).toEqual({ entries: [] });
    expect(await fileExists(`${filePath}.corrupt-${process.pid}`)).toBe(true);
    expect(errors).toHaveLength(1);
  });

  it("fails hard on a corrupt file when onCorrupt is 'throw'", async () => {
    const { store, filePath } = await createStore({ onCorrupt: "throw" });
    await writeFile(filePath, "{ not json", "utf8");

    expect(store.read()).rejects.toThrow(`Corrupt JSON store at ${filePath}`);

    // The file stays in place for inspection — nothing is moved or reset.
    expect(await readFile(filePath, "utf8")).toBe("{ not json");
    expect(await fileExists(`${filePath}.corrupt-${process.pid}`)).toBe(false);
  });

  it("serializes enqueued writes in order, surviving failures", async () => {
    const { store } = await createStore();
    const order: string[] = [];
    let releaseFirst = (): void => {};
    const gate = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });

    const first = store.enqueueWrite(async () => {
      await gate;
      order.push("first");
    });
    const second = store
      .enqueueWrite(async () => {
        order.push("second");
        throw new Error("second failed");
      })
      .catch(() => order.push("second rejected"));
    const third = store.enqueueWrite(async () => {
      order.push("third");
    });

    releaseFirst();
    await Promise.all([first, second, third]);
    expect(order.filter((entry) => entry !== "second rejected")).toEqual([
      "first",
      "second",
      "third",
    ]);
    expect(order).toContain("second rejected");
  });
});
