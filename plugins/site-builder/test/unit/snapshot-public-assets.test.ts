import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { promises as fs } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import {
  MAX_PUBLIC_ASSET_SNAPSHOT_BYTES,
  snapshotPublicAssets,
} from "../../src/lib/snapshot-public-assets";

describe("snapshotPublicAssets", () => {
  let testDir: string;
  let publicDir: string;
  const signal = (): AbortSignal => new AbortController().signal;

  beforeEach(async () => {
    testDir = await fs.mkdtemp(join(tmpdir(), "snapshot-public-assets-"));
    publicDir = join(testDir, "public");
    await fs.mkdir(publicDir, { recursive: true });
  });

  afterEach(async () => {
    await fs.rm(testDir, { recursive: true, force: true });
  });

  it("captures nested binary files as base64 keyed by posix-relative path", async () => {
    await fs.mkdir(join(publicDir, "media"), { recursive: true });
    await fs.writeFile(join(publicDir, "logo.bin"), Buffer.from([0, 1, 2, 3]));
    await fs.writeFile(join(publicDir, "media", "note.txt"), "hello");

    const assets = await snapshotPublicAssets(publicDir, signal());

    expect(assets).toEqual({
      "logo.bin": "AAECAw==",
      "media/note.txt": Buffer.from("hello").toString("base64"),
    });
  });

  it("returns an empty snapshot when the directory does not exist", async () => {
    const assets = await snapshotPublicAssets(
      join(testDir, "absent"),
      signal(),
    );

    expect(assets).toEqual({});
  });

  it("rejects symbolic links rather than following them out of the directory", async () => {
    await fs.writeFile(join(testDir, "outside.txt"), "outside");
    await fs.symlink(join(testDir, "outside.txt"), join(publicDir, "link.txt"));

    expect(snapshotPublicAssets(publicDir, signal())).rejects.toThrow(
      "Public asset cannot be a symbolic link: link.txt",
    );
  });

  it("refuses to snapshot a tree larger than the configured budget", async () => {
    await fs.writeFile(join(publicDir, "big.bin"), Buffer.alloc(2_048));

    expect(snapshotPublicAssets(publicDir, signal(), 1_024)).rejects.toThrow(
      /App public assets exceed the 1024 byte snapshot budget at "big\.bin"/,
    );
  });

  it("counts the whole tree against the budget, not individual files", async () => {
    await fs.mkdir(join(publicDir, "nested"), { recursive: true });
    await fs.writeFile(join(publicDir, "a.bin"), Buffer.alloc(600));
    await fs.writeFile(join(publicDir, "nested", "b.bin"), Buffer.alloc(600));

    expect(snapshotPublicAssets(publicDir, signal(), 1_024)).rejects.toThrow(
      "App public assets exceed the 1024 byte snapshot budget",
    );
  });

  it("defaults to a budget far above a realistic site's public directory", () => {
    expect(MAX_PUBLIC_ASSET_SNAPSHOT_BYTES).toBe(64 * 1024 * 1024);
  });
});
