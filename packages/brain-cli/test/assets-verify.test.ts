import { afterEach, describe, expect, it } from "bun:test";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { openOfflineEntityDatabase } from "@brains/entity-service";
import { runAssetsMigrate } from "../src/commands/assets-migrate";
import { runAssetsVerify } from "../src/commands/assets-verify";
import {
  dataUrl,
  fixture,
  GIF,
  PNG,
  removeFixtures,
  stopped,
} from "./helpers/binary-asset-fixture";

afterEach(removeFixtures);

/** A database whose inline images were migrated, and its brain-data dir. */
async function migrated(
  rows: Array<[id: string, content: string]>,
): Promise<{ path: string; brainData: string }> {
  const path = await fixture(rows);
  const migration = await runAssetsMigrate(
    "/",
    { database: path, manifest: join(dirname(path), "manifest.json") },
    stopped,
  );
  if (!migration.success) throw new Error(migration.message);
  const brainData = join(dirname(path), "brain-data");
  await mkdir(join(brainData, "image"), { recursive: true });
  return { path, brainData };
}

describe("assets:verify", () => {
  it("passes when every migrated image resolves to an intact asset", async () => {
    const { path } = await migrated([
      ["cover", dataUrl("png", PNG)],
      ["avatar", dataUrl("gif", GIF)],
    ]);

    const result = await runAssetsVerify("/", { database: path }, stopped);

    expect(result.success).toBe(true);
    expect(result.message).toContain("2 asset-backed image(s): 2 valid");
  });

  it("fails on an asset whose bytes no longer match, naming it", async () => {
    const { path } = await migrated([["cover", dataUrl("png", PNG)]]);
    const client = openOfflineEntityDatabase(path).client;
    try {
      await client.execute(
        "UPDATE asset_chunks SET bytes = zeroblob(length(bytes))",
      );
    } finally {
      client.close();
    }

    const result = await runAssetsVerify("/", { database: path }, stopped);

    expect(result.success).toBe(false);
    expect(result.message).toContain("cover: corrupt");
  });

  it("fails while inline images or their full-text rows remain", async () => {
    const path = await fixture([["cover", dataUrl("png", PNG)]], ["cover"]);

    const result = await runAssetsVerify("/", { database: path }, stopped);

    expect(result.success).toBe(false);
    expect(result.message).toContain("1 inline image(s) left");
    expect(result.message).toContain("1 image full-text row(s) left");
  });

  it("compares mirrored files with the stored bytes", async () => {
    const { path, brainData } = await migrated([
      ["cover", dataUrl("png", PNG)],
      ["banner", dataUrl("png", PNG)],
      ["avatar", dataUrl("gif", GIF)],
    ]);
    await writeFile(join(brainData, "image", "cover.png"), PNG);
    await writeFile(
      join(brainData, "image", "banner.md"),
      `${dataUrl("png", PNG)}\n`,
    );

    const result = await runAssetsVerify(
      "/",
      { database: path, brainData },
      stopped,
    );

    expect(result.success).toBe(true);
    expect(result.message).toContain("2 mirrored file(s) match");
    expect(result.message).toContain("1 image(s) not mirrored: avatar");
  });

  it("fails when a mirrored file differs from the stored bytes", async () => {
    const { path, brainData } = await migrated([
      ["cover", dataUrl("png", PNG)],
    ]);
    await writeFile(join(brainData, "image", "cover.png"), GIF);

    const result = await runAssetsVerify(
      "/",
      { database: path, brainData },
      stopped,
    );

    expect(result.success).toBe(false);
    expect(result.message).toContain("cover: mirrored file differs");
  });
});
