import { afterEach, beforeEach, expect, test } from "bun:test";
import assert from "node:assert/strict";
import {
  mkdtemp,
  readFile,
  readdir,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { withFileTarget } from "../src/turso-worker/file-target";

let directory: string;
beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), "turso-file-target-"));
});
afterEach(async () => {
  await rm(directory, { recursive: true, force: true });
});

test("publishes only the completed file and rejects late writes", async () => {
  const path = join(directory, "output");
  let late: (() => Promise<void>) | undefined;
  const value = await withFileTarget({ path, sizeBytes: 3 }, async (target) => {
    expect(await Bun.file(path).exists()).toBe(false);
    await target.write(new Uint8Array([1, 2, 3]));
    late = (): Promise<void> => target.write(new Uint8Array([4]));
    expect(await Bun.file(path).exists()).toBe(false);
    return "done";
  });
  expect(value).toBe("done");
  expect([...(await readFile(path))]).toEqual([1, 2, 3]);
  expect(await readdir(directory)).toEqual(["output"]);
  assert.ok(late);
  await assert.rejects(late(), /closed/);
});

test("never replaces an existing file or symlink", async () => {
  const existing = join(directory, "existing");
  const alias = join(directory, "alias");
  await writeFile(existing, "old");
  await symlink(existing, alias);
  for (const path of [existing, alias]) {
    await assert.rejects(
      withFileTarget({ path, sizeBytes: 1 }, (target) =>
        target.write(new Uint8Array([0])),
      ),
      /EEXIST/,
    );
  }
  expect(await readFile(existing, "utf8")).toBe("old");
  const raced = join(directory, "raced");
  await assert.rejects(
    withFileTarget({ path: raced, sizeBytes: 1 }, async (target) => {
      await target.write(new Uint8Array([0]));
      await writeFile(raced, "raced");
    }),
    /EEXIST/,
  );
  expect(await readFile(raced, "utf8")).toBe("raced");
});

test("retains failed staging output without publishing and preserves the primary cause", async () => {
  const path = join(directory, "output");
  const primary = new Error("transfer failed");
  await assert.rejects(
    withFileTarget({ path, sizeBytes: 3 }, async (target) => {
      await target.write(new Uint8Array([1]));
      throw primary;
    }),
    (error: unknown) => error === primary,
  );
  expect(await Bun.file(path).exists()).toBe(false);
  const files = await readdir(directory);
  expect(files.length).toBe(1);
  expect([...(await readFile(join(directory, files[0] ?? "missing")))]).toEqual(
    [1],
  );
  await assert.rejects(
    withFileTarget({ path, sizeBytes: 3 }, async (target) => {
      await target.write(new Uint8Array([1]));
    }),
    /completely written/,
  );
  expect(await Bun.file(path).exists()).toBe(false);
});

test("publishes empty output but does not publish after pre-publication cancellation", async () => {
  const empty = join(directory, "empty");
  await withFileTarget({ path: empty, sizeBytes: 0 }, async () => undefined);
  expect((await readFile(empty)).byteLength).toBe(0);
  const path = join(directory, "cancelled");
  const cancellation = new AbortController();
  const reason = new Error("cancel before publication");
  await assert.rejects(
    withFileTarget(
      { path, sizeBytes: 1 },
      async (target) => {
        await target.write(new Uint8Array([1]));
        cancellation.abort(reason);
      },
      cancellation.signal,
    ),
    (error: unknown) => error === reason,
  );
  expect(await Bun.file(path).exists()).toBe(false);
});

test("bounds and serializes borrowed writes", async () => {
  const path = join(directory, "output");
  await withFileTarget({ path, sizeBytes: 1 }, async (target) => {
    const first = target.write(new Uint8Array([1]));
    await assert.rejects(target.write(new Uint8Array([2])), /Concurrent/);
    await first;
    await assert.rejects(target.write(new Uint8Array(32769)), /credit/);
  });
  expect([...(await readFile(path))]).toEqual([1]);
  await assert.rejects(
    withFileTarget({ path: "relative", sizeBytes: 0 }, async () => undefined),
  );
  await assert.rejects(
    withFileTarget(
      { path, sizeBytes: 100 * 1024 * 1024 + 1 },
      async () => undefined,
    ),
  );
});
