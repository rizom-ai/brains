import { afterEach, beforeEach, expect, test, spyOn } from "bun:test";
import assert from "node:assert/strict";
import * as fs from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { prepareAsset } from "@brains/assets";
import { exportImageFile } from "../src/lib/image-file-export";
import { mockFileAssets } from "./helpers/file-assets";
const bytes = Buffer.from("new");
const asset = prepareAsset(bytes);
const date = new Date("2020-01-01T00:00:00Z");
let root: string;
let path: string;
beforeEach(async () => {
  root = await fs.mkdtemp(join(tmpdir(), "image-export-"));
  path = join(root, "image.png");
});
afterEach(async () => {
  await fs.rm(root, { recursive: true, force: true });
});
async function staging(): Promise<string> {
  const entries = await fs.readdir(root);
  const name = entries.find((entry) => entry.startsWith(".turso-export-"));
  assert.ok(name);
  return join(root, name);
}
test("export preserves the old inode until verified download completes, then replaces atomically", async () => {
  await fs.writeFile(path, "old");
  const original = await fs.stat(path);
  const ready = Promise.withResolvers<void>();
  const release = Promise.withResolvers<void>();
  const files = mockFileAssets(undefined, async () => {
    ready.resolve();
    await release.promise;
    return bytes;
  });
  const pending = exportImageFile(files, path, asset.ref, date);
  try {
    await ready.promise;
    expect(await fs.readFile(path, "utf8")).toBe("old");
  } finally {
    release.resolve();
  }
  expect(await pending).toBe(true);
  expect(await fs.readFile(path, "utf8")).toBe("new");
  const current = await fs.stat(path);
  expect(current.ino).not.toBe(original.ino);
  expect(current.mtime.getTime()).toBe(date.getTime());
  expect(await fs.readdir(root)).toEqual(["image.png"]);
});
test("unchanged images retain their inode and timestamp after actor comparison", async () => {
  await fs.writeFile(path, bytes);
  const original = await fs.stat(path);
  const files = mockFileAssets(undefined, async () => bytes);
  expect(await exportImageFile(files, path, asset.ref, date)).toBe(false);
  const current = await fs.stat(path);
  expect(current.ino).toBe(original.ino);
  expect(current.mtimeMs).toBe(original.mtimeMs);
  expect(await fs.readdir(root)).toEqual(["image.png"]);
});
test("unacknowledged private downloads preserve old output and failed staging", async () => {
  await fs.writeFile(path, "old");
  const files = mockFileAssets();
  const failure = new Error("file publication acknowledgement failed");
  files.download = async ({ outputFile }): Promise<never> => {
    await fs.writeFile(outputFile, bytes);
    throw failure;
  };
  await assert.rejects(
    exportImageFile(files, path, asset.ref, date),
    (error: unknown) => error === failure,
  );
  expect(await fs.readFile(path, "utf8")).toBe("old");
  expect(await fs.readFile(join(await staging(), "verified"), "utf8")).toBe(
    "new",
  );
});
test("exports do not follow destination symlinks", async () => {
  const target = join(root, "target");
  await fs.writeFile(target, "old");
  await fs.symlink(target, path);
  await assert.rejects(
    exportImageFile(
      mockFileAssets(undefined, async () => bytes),
      path,
      asset.ref,
      date,
    ),
    /not a regular file/,
  );
  expect(await fs.readFile(target, "utf8")).toBe("old");
  expect((await fs.lstat(path)).isSymbolicLink()).toBe(true);
});
test("observed concurrent destination changes abort replacement and retain staging", async () => {
  await fs.writeFile(path, "old");
  const files = mockFileAssets(undefined, async () => bytes);
  const fingerprint = files.fingerprint;
  files.fingerprint = async (input): ReturnType<typeof fingerprint> => {
    const result = await fingerprint(input);
    await fs.writeFile(path, "concurrent edit");
    return result;
  };
  await assert.rejects(
    exportImageFile(files, path, asset.ref, date),
    /changed during comparison/,
  );
  expect(await fs.readFile(path, "utf8")).toBe("concurrent edit");
  expect(await fs.readFile(join(await staging(), "verified"), "utf8")).toBe(
    "new",
  );
});
test("first exports refuse a destination created during publication", async () => {
  const link = fs.link;
  const race = spyOn(fs, "link").mockImplementation(
    async (source, target): Promise<void> => {
      await fs.writeFile(path, "concurrent creation");
      await link(source, target);
    },
  );
  try {
    await assert.rejects(
      exportImageFile(
        mockFileAssets(undefined, async () => bytes),
        path,
        asset.ref,
        date,
      ),
      /EEXIST/,
    );
    expect(await fs.readFile(path, "utf8")).toBe("concurrent creation");
    expect(await fs.readFile(join(await staging(), "verified"), "utf8")).toBe(
      "new",
    );
  } finally {
    race.mockRestore();
  }
});

test("uncertain rename outcomes never retract new output and retain the previous inode", async () => {
  await fs.writeFile(path, "old");
  const rename = fs.rename;
  const failure = new Error("rename acknowledgement lost");
  const fault = spyOn(fs, "rename").mockImplementation(
    async (source, target): Promise<void> => {
      await rename(source, target);
      throw failure;
    },
  );
  try {
    await assert.rejects(
      exportImageFile(
        mockFileAssets(undefined, async () => bytes),
        path,
        asset.ref,
        date,
      ),
      (error: unknown) => error === failure,
    );
    expect(await fs.readFile(path, "utf8")).toBe("new");
    expect(await fs.readFile(join(await staging(), "previous"), "utf8")).toBe(
      "old",
    );
  } finally {
    fault.mockRestore();
  }
});
