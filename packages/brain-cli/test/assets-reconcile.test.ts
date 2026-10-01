import { afterEach, describe, expect, it } from "bun:test";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import {
  computeAssetDigest,
  createAssetRef,
  openOfflineEntityDatabase,
} from "@brains/entity-service";
import { runAssetsMigrate } from "../src/commands/assets-migrate";
import { runAssetsReconcile } from "../src/commands/assets-reconcile";
import {
  dataUrl,
  fixture,
  GIF,
  PNG,
  removeFixtures,
  stopped,
} from "./helpers/binary-asset-fixture";

afterEach(removeFixtures);

const pngRef = createAssetRef(computeAssetDigest(PNG));

/** A database and its brain-data dir, holding these image files. */
async function withFiles(
  rows: Array<[id: string, content: string]>,
  files: Array<[name: string, bytes: Buffer | string]>,
): Promise<{ path: string; from: string }> {
  const path = await fixture(rows);
  const from = join(dirname(path), "brain-data");
  await mkdir(join(from, "image"), { recursive: true });
  await Promise.all(
    files.map(([name, bytes]) => writeFile(join(from, "image", name), bytes)),
  );
  return { path, from };
}

async function content(path: string, id: string): Promise<string | undefined> {
  const client = openOfflineEntityDatabase(path).client;
  try {
    const result = await client.execute({
      sql: "SELECT content FROM entities WHERE entityType = 'image' AND id = ?",
      args: [id],
    });
    const value = result.rows[0]?.["content"];
    return value === undefined ? undefined : String(value);
  } finally {
    client.close();
  }
}

async function dropAssets(path: string): Promise<void> {
  const client = openOfflineEntityDatabase(path).client;
  try {
    await client.execute("DELETE FROM asset_chunks");
    await client.execute("DELETE FROM assets");
    await client.execute("DELETE FROM asset_uploads");
  } finally {
    client.close();
  }
}

describe("assets:reconcile", () => {
  it("creates rows for image files the database lacks, binary or text-form", async () => {
    const { path, from } = await withFiles(
      [],
      [
        ["cover.png", PNG],
        ["avatar.md", `${dataUrl("gif", GIF)}\n`],
      ],
    );

    const result = await runAssetsReconcile(
      "/",
      { database: path, from },
      stopped,
    );

    expect(result.success).toBe(true);
    expect(result.message).toContain("created: avatar, cover");
    expect(await content(path, "cover")).toBe(pngRef);
    expect(await content(path, "avatar")).toBe(
      createAssetRef(computeAssetDigest(GIF)),
    );

    const rerun = await runAssetsReconcile(
      "/",
      { database: path, from },
      stopped,
    );
    expect(rerun.message).toContain("in sync: avatar, cover");
  });

  it("restores the asset behind a reference whose bytes were lost", async () => {
    const { path, from } = await withFiles(
      [["cover", dataUrl("png", PNG)]],
      [["cover.png", PNG]],
    );
    await runAssetsMigrate("/", { database: path }, stopped);
    await dropAssets(path);

    const result = await runAssetsReconcile(
      "/",
      { database: path, from },
      stopped,
    );

    expect(result.success).toBe(true);
    expect(result.message).toContain("restored asset: cover");
  });

  it("repairs a double-encoded inline row from its file", async () => {
    const reencoded = Buffer.from(dataUrl("png", PNG), "base64").toString(
      "base64",
    );
    const { path, from } = await withFiles(
      [["cover", `data:image/png;base64,${reencoded}`]],
      [["cover.png", PNG]],
    );

    const result = await runAssetsReconcile(
      "/",
      { database: path, from },
      stopped,
    );

    expect(result.success).toBe(true);
    expect(result.message).toContain("restored from file: cover");
    expect(await content(path, "cover")).toBe(pngRef);
  });

  it("leaves a healthy inline row to the migration", async () => {
    const { path, from } = await withFiles(
      [["cover", dataUrl("png", PNG)]],
      [["cover.png", PNG]],
    );

    const result = await runAssetsReconcile(
      "/",
      { database: path, from },
      stopped,
    );

    expect(result.message).toContain("inline, run assets:migrate: cover");
    expect(await content(path, "cover")).toStartWith("data:");
  });

  it("reports a reference that disagrees with its file and changes nothing", async () => {
    const { path, from } = await withFiles(
      [["cover", dataUrl("png", PNG)]],
      [["cover.png", GIF]],
    );
    await runAssetsMigrate("/", { database: path }, stopped);

    const result = await runAssetsReconcile(
      "/",
      { database: path, from },
      stopped,
    );

    expect(result.success).toBe(false);
    expect(result.message).toContain("mismatch: cover");
    expect(await content(path, "cover")).toBe(pngRef);
  });

  it("fails on a reference with neither its asset nor a file", async () => {
    const { path, from } = await withFiles(
      [["cover", dataUrl("png", PNG)]],
      [],
    );
    await runAssetsMigrate("/", { database: path }, stopped);
    await dropAssets(path);

    const result = await runAssetsReconcile(
      "/",
      { database: path, from },
      stopped,
    );

    expect(result.success).toBe(false);
    expect(result.message).toContain("unrecoverable: cover");
  });

  it("previews without writing", async () => {
    const { path, from } = await withFiles([], [["cover.png", PNG]]);

    const result = await runAssetsReconcile(
      "/",
      { database: path, from, dryRun: true },
      stopped,
    );

    expect(result.success).toBe(true);
    expect(result.message).toContain("would create: cover");
    expect(await content(path, "cover")).toBeUndefined();
  });

  it("restores from the readable file when an image has several", async () => {
    const { path, from } = await withFiles(
      [],
      [
        ["cover.png", "not an image"],
        ["cover.md", `${dataUrl("png", PNG)}\n`],
      ],
    );

    const result = await runAssetsReconcile(
      "/",
      { database: path, from },
      stopped,
    );

    expect(result.success).toBe(true);
    expect(result.message).toContain("created: cover");
    expect(result.message).toContain("ignored unreadable file(s): cover.png");
    expect(await content(path, "cover")).toBe(pngRef);
  });
});
