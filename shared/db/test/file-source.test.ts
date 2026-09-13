import { afterEach, beforeEach, test } from "bun:test";
import assert from "node:assert/strict";
import {
  mkdtemp,
  rm,
  writeFile,
  symlink,
  truncate,
  utimes,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { withFileSource } from "../src/turso-worker/file-source";
import { SqlWorkerDriver } from "../src/turso-worker/client";
import { PersistenceBudgetPool } from "../src/turso-worker/budget-pool";
import { uploadNetworkFixture } from "./fixtures/turso-thread/network-exercise";

let directory: string;
const cleanups: (() => Promise<void>)[] = [];
beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), "turso-file-source-"));
});
afterEach(async () => {
  const errors: unknown[] = [];
  for (const cleanup of cleanups.splice(0).reverse()) {
    try {
      await cleanup();
    } catch (error) {
      errors.push(error);
    }
  }
  if (errors.length)
    throw new AggregateError(errors, "File source fixture cleanup failed");
  await rm(directory, { recursive: true, force: true });
});

test("fills borrowed credit buffers, handles an empty source, and closes before returning", async () => {
  const path = join(directory, "input");
  await writeFile(path, "abc");
  let lateRead: (() => Promise<void>) | undefined;
  const result = await withFileSource(
    { path, sizeBytes: 3 },
    async (source) => {
      const bytes = new Uint8Array(2);
      await source.readInto(bytes);
      assert.deepEqual([...bytes], [97, 98]);
      await source.readInto(bytes.subarray(0, 1));
      assert.equal(bytes[0], 99);
      await source.complete();
      lateRead = (): Promise<void> => source.readInto(bytes);
      return "done";
    },
  );
  assert.equal(result, "done");
  assert(lateRead);
  await assert.rejects(lateRead(), /closed or complete/);
  await writeFile(path, "");
  assert.equal(
    await withFileSource({ path, sizeBytes: 0 }, async (source) => {
      await source.complete();
      return 0;
    }),
    0,
  );
});

test("rejects relative paths, symlinks, non-files and mismatched declarations without a fallback", async () => {
  const path = join(directory, "input");
  await writeFile(path, "abc");
  const link = join(directory, "link");
  await symlink(path, link);
  let entered = false;
  for (const input of [
    { path: "relative", sizeBytes: 3 },
    { path: link, sizeBytes: 3 },
    { path: directory, sizeBytes: 0 },
    { path, sizeBytes: 4 },
  ]) {
    await assert.rejects(
      withFileSource(input, async () => {
        entered = true;
      }),
    );
  }
  assert.equal(entered, false);
});

test("requires complete consumption and rejects source mutation before the terminal frame", async () => {
  const path = join(directory, "input");
  await writeFile(path, "abc");
  await assert.rejects(
    withFileSource({ path, sizeBytes: 3 }, async () => {}),
    /completion/,
  );
  await assert.rejects(
    withFileSource({ path, sizeBytes: 3 }, async (source) => {
      await source.complete();
    }),
    /completely consumed/,
  );
  await assert.rejects(
    withFileSource({ path, sizeBytes: 3 }, async (source) => {
      await source.readInto(new Uint8Array(3));
      await truncate(path, 2);
      await source.complete();
    }),
    /changed during transfer/,
  );
  await writeFile(path, "abc");
  await assert.rejects(
    withFileSource({ path, sizeBytes: 3 }, async (source) => {
      await source.readInto(new Uint8Array(3));
      await utimes(path, 1, 1);
      await source.complete();
    }),
    /changed during transfer/,
  );
});

test("does not allow concurrent native reads and preserves the primary failure", async () => {
  const path = join(directory, "input");
  await writeFile(path, "x");
  const primary = new Error("producer disconnected");
  await assert.rejects(
    withFileSource({ path, sizeBytes: 1 }, async (source) => {
      const read = source.readInto(new Uint8Array(1));
      await assert.rejects(source.readInto(new Uint8Array(1)), /Concurrent/);
      await read;
      throw primary;
    }),
    (error: unknown): boolean => error === primary,
  );
});

test("the separate payload process sends the canonical 2 MiB PNG fixture directly to a reserved native stage", async () => {
  const path = join(directory, "image.png");
  const size = 2 * 1024 * 1024 + 7;
  const expectedDigest =
    "7e669b7062e7303b6b89603b041faaa151e9c0e37fed549258a422760a734962";
  // Fixture generation only. The controller helper receives the path, never these bytes.
  const bytes = Buffer.alloc(size);
  Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
    "base64",
  ).copy(bytes);
  await writeFile(path, bytes);
  const pool = new PersistenceBudgetPool();
  const driver = new SqlWorkerDriver({
    url: pathToFileURL(join(directory, "data.db")).href,
    workerUrl: new URL("../src/turso-worker/worker.ts", import.meta.url),
    budget: pool,
  });
  cleanups.push(() => driver.close());
  const scope = await driver.openBinaryScope();
  cleanups.push(() => scope.close());
  const stage = await scope.begin({
    reservationBytes: size,
    expectedSize: size,
    expectedDigest,
  });
  const options = {
    bridgeUrl: new URL(
      "../src/turso-worker/network-ingress-worker.ts",
      import.meta.url,
    ),
    producerUrl: new URL(
      "./fixtures/turso-thread/network-producer.ts",
      import.meta.url,
    ),
    bunExecutable: process.execPath,
    sourceFile: path,
  };
  const sealed = await uploadNetworkFixture(driver, pool, stage, size, options);
  assert.equal(sealed.sizeBytes, size);
  assert.equal(sealed.sha256, expectedDigest);
  assert.equal(pool.stats().residentBytes, size);
  await scope.discard(stage);
  assert.equal(pool.stats().residentBytes, 0);
  const missing = await scope.begin({
    reservationBytes: size,
    expectedSize: size,
    expectedDigest,
  });
  await assert.rejects(
    uploadNetworkFixture(driver, pool, missing, size, {
      ...options,
      sourceFile: join(directory, "missing.png"),
    }),
  );
  await scope.close();
  assert.equal(pool.stats().residentBytes, 0);
  assert.equal(pool.ingress.stats().slots, 0);
  assert.equal(pool.networkIngress.stats().slots, 0);
});
