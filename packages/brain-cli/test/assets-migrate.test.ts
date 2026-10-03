import { afterEach, describe, expect, it } from "bun:test";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import {
  computeAssetDigest,
  createAssetRef,
  openOfflineEntityDatabase,
} from "@brains/entity-service";
import { computeContentHash } from "@brains/utils/hash";
import { z } from "@brains/utils/zod";
import { runAssetsMigrate } from "../src/commands/assets-migrate";
import { runAssetsVerify } from "../src/commands/assets-verify";
import {
  dataUrl,
  fixture,
  GIF,
  mainEraFixture,
  PNG,
  removeFixtures,
  stopped,
} from "./helpers/binary-asset-fixture";
import { planImageAssetMigration } from "../src/lib/binary-asset-migration-plan";

afterEach(removeFixtures);

const manifestSchema = z.object({
  runs: z.array(
    z.object({ entries: z.array(z.record(z.string(), z.unknown())) }),
  ),
});

describe("planImageAssetMigration", () => {
  it("reports what migrating every inline image would do", async () => {
    const path = await fixture(
      [
        ["cover", dataUrl("png", PNG)],
        ["cover-copy", dataUrl("png", PNG)],
        ["avatar", dataUrl("gif", GIF)],
        ["logo", dataUrl("svg+xml", Buffer.from("<svg/>"))],
        ["broken", "data:image/png;base64,@@@@"],
        ["done", `asset://sha256/${"b".repeat(64)}`],
      ],
      ["cover", "logo"],
    );
    const client = openOfflineEntityDatabase(path).client;
    try {
      const plan = await planImageAssetMigration(client, {
        databaseBytes: 1000,
      });

      expect(plan).toMatchObject({
        inlineRows: 5,
        ready: 3,
        blocked: [
          { id: "broken", reason: "malformed" },
          { id: "logo", reason: "svg" },
        ],
        alreadyMigrated: 1,
        uniqueDigests: 2,
        duplicateRows: 1,
        alreadyStoredDigests: 0,
        bytesToStore: PNG.byteLength + GIF.byteLength,
        ftsRows: 2,
        contentHashChanges: 3,
      });
      const inlineBytes =
        2 * dataUrl("png", PNG).length + dataUrl("gif", GIF).length;
      expect(plan.inlineBytesFreed).toBe(inlineBytes);
      const afterMigration = 1000 + PNG.byteLength + GIF.byteLength;
      expect(plan.disk).toEqual({
        databaseBytes: 1000,
        backupBytes: 1000,
        afterMigrationBytes: afterMigration,
        vacuumBytes: afterMigration - inlineBytes,
        peakBytes: 1000 + afterMigration + (afterMigration - inlineBytes),
      });
    } finally {
      client.close();
    }
  });

  it("counts bytes already stored as assets as nothing to store", async () => {
    const path = await fixture([["cover", dataUrl("png", PNG)]]);
    const client = openOfflineEntityDatabase(path).client;
    try {
      await client.execute(
        "INSERT INTO asset_uploads (upload_id, created) VALUES ('u', 1)",
      );
      await client.execute({
        sql: "INSERT INTO assets (digest, upload_id, size_bytes, chunk_count, created) VALUES (?, 'u', ?, 1, 1)",
        args: [computeAssetDigest(PNG), PNG.byteLength],
      });

      const plan = await planImageAssetMigration(client, { databaseBytes: 0 });

      expect(plan.alreadyStoredDigests).toBe(1);
      expect(plan.bytesToStore).toBe(0);
    } finally {
      client.close();
    }
  });
});

describe("assets:migrate", () => {
  it("passes a dry-run with no blockers", async () => {
    const path = await fixture([["cover", dataUrl("png", PNG)]]);

    const result = await runAssetsMigrate(
      "/",
      { database: path, dryRun: true },
      stopped,
    );

    expect(result.success).toBe(true);
    expect(result.message).toContain("1 inline image(s): 1 ready, 0 blocked");
  });

  it("fails a dry-run that finds blockers, naming each row", async () => {
    const path = await fixture([
      ["cover", dataUrl("png", PNG)],
      ["logo", dataUrl("svg+xml", Buffer.from("<svg/>"))],
    ]);

    const result = await runAssetsMigrate(
      "/",
      { database: path, dryRun: true },
      stopped,
    );

    expect(result.success).toBe(false);
    expect(result.message).toContain("logo: svg");
    expect(result.message).toContain("svg: ");
  });

  it("refuses a remote database", async () => {
    const result = await runAssetsMigrate(
      "/",
      { database: "libsql://brain.example.com", dryRun: true },
      stopped,
    );

    expect(result.success).toBe(false);
    expect(result.message).toContain("local");
  });

  it("refuses a database that does not exist", async () => {
    const result = await runAssetsMigrate(
      "/",
      { database: "/nonexistent/brain.db", dryRun: true },
      stopped,
    );

    expect(result.success).toBe(false);
    expect(result.message).toContain("/nonexistent/brain.db");
  });

  it("refuses while another process holds the database open", async () => {
    const path = await fixture([]);

    const result = await runAssetsMigrate(
      "/",
      { database: path, dryRun: true },
      { findHolders: async (): Promise<number[]> => [4242] },
    );

    expect(result.success).toBe(false);
    expect(result.message).toContain("4242");
  });

  it("refuses when it cannot tell whether the app is stopped", async () => {
    const path = await fixture([]);

    const result = await runAssetsMigrate(
      "/",
      { database: path, dryRun: true },
      { findHolders: async (): Promise<undefined> => undefined },
    );

    expect(result.success).toBe(false);
    expect(result.message).toContain("cannot confirm");
  });

  it("migrates every inline image and records it in the manifest", async () => {
    const path = await fixture(
      [
        ["cover", dataUrl("png", PNG)],
        ["cover-copy", dataUrl("png", PNG)],
        ["avatar", dataUrl("gif", GIF)],
      ],
      ["cover"],
    );
    const manifestPath = join(dirname(path), "manifest.json");

    const result = await runAssetsMigrate(
      "/",
      { database: path, manifest: manifestPath },
      stopped,
    );

    expect(result.success).toBe(true);
    expect(result.message).toContain("Migrated 3 image(s)");
    const client = openOfflineEntityDatabase(path).client;
    try {
      const rows = await client.execute(
        "SELECT id, content FROM entities WHERE entityType = 'image' ORDER BY id",
      );
      expect(rows.rows.map((row) => String(row["content"]))).toEqual([
        createAssetRef(computeAssetDigest(GIF)),
        createAssetRef(computeAssetDigest(PNG)),
        createAssetRef(computeAssetDigest(PNG)),
      ]);
      expect(
        Number(
          (await client.execute("SELECT COUNT(*) FROM entity_fts"))
            .rows[0]?.[0],
        ),
      ).toBe(0);
    } finally {
      client.close();
    }
    const manifestText = await readFile(manifestPath, "utf8");
    expect(manifestText).not.toContain("base64");
    const manifest = manifestSchema.parse(JSON.parse(manifestText));
    expect(manifest.runs).toHaveLength(1);
    expect(manifest.runs[0]?.entries).toContainEqual({
      id: "cover",
      outcome: "migrated",
      oldContentHash: "hash-cover",
      newContentHash: computeContentHash(
        createAssetRef(computeAssetDigest(PNG)),
      ),
      digest: computeAssetDigest(PNG),
      mediaType: "image/png",
      sizeBytes: PNG.byteLength,
    });
  });

  it("skips completed rows on a rerun and appends the run", async () => {
    const path = await fixture([["cover", dataUrl("png", PNG)]]);
    const manifestPath = join(dirname(path), "manifest.json");
    await runAssetsMigrate(
      "/",
      { database: path, manifest: manifestPath },
      stopped,
    );

    const rerun = await runAssetsMigrate(
      "/",
      { database: path, manifest: manifestPath },
      stopped,
    );

    expect(rerun.success).toBe(true);
    expect(rerun.message).toContain("Migrated 0 image(s)");
    const manifest = manifestSchema.parse(
      JSON.parse(await readFile(manifestPath, "utf8")),
    );
    expect(manifest.runs.map((run) => run.entries.length)).toEqual([1, 0]);
  });

  it("refuses to migrate while any image is blocked, writing nothing", async () => {
    const path = await fixture([
      ["cover", dataUrl("png", PNG)],
      ["logo", dataUrl("svg+xml", Buffer.from("<svg/>"))],
    ]);

    const result = await runAssetsMigrate("/", { database: path }, stopped);

    expect(result.success).toBe(false);
    expect(result.message).toContain("logo: svg");
    const client = openOfflineEntityDatabase(path).client;
    try {
      const cover = await client.execute(
        "SELECT content FROM entities WHERE id = 'cover'",
      );
      expect(String(cover.rows[0]?.["content"])).toStartWith("data:");
    } finally {
      client.close();
    }
  });

  it("brings a database written by main to the staged schema before migrating", async () => {
    const path = await mainEraFixture([["cover", dataUrl("png", PNG)]]);

    const preview = await runAssetsMigrate(
      "/",
      { database: path, dryRun: true },
      stopped,
    );
    const result = await runAssetsMigrate("/", { database: path }, stopped);

    expect(preview.success).toBe(true);
    expect(result.success).toBe(true);
    expect(result.message).toContain("Migrated 1 image(s)");
  });

  it("migrates around images awaiting their bytes and clears an old placeholder", async () => {
    const path = await fixture([
      ["cover", dataUrl("png", PNG)],
      ["pending", ""],
      // A failed image written while pending images held a 1x1 placeholder.
      ["failed", dataUrl("png", PNG)],
      // A regeneration that failed over an existing image keeps its bytes.
      ["failed-real", dataUrl("gif", GIF)],
    ]);
    const client = openOfflineEntityDatabase(path).client;
    try {
      await client.execute(
        "UPDATE entities SET metadata = json_object('status', 'pending') WHERE id = 'pending'",
      );
      await client.execute(
        "UPDATE entities SET metadata = json_object('status', 'failed', 'format', 'png', 'width', 1, 'height', 1) WHERE id = 'failed'",
      );
      await client.execute(
        "UPDATE entities SET metadata = json_object('status', 'failed') WHERE id = 'failed-real'",
      );
    } finally {
      client.close();
    }
    const manifest = join(dirname(path), "manifest.json");

    const dryRun = await runAssetsMigrate(
      "/",
      { database: path, dryRun: true },
      stopped,
    );
    expect(dryRun.success).toBe(true);
    expect(dryRun.message).toContain("2 inline image(s): 2 ready, 0 blocked");
    expect(dryRun.message).toContain(
      "2 image(s) awaiting their bytes; 1 old placeholder to clear.",
    );

    const migration = await runAssetsMigrate(
      "/",
      { database: path, manifest },
      stopped,
    );
    expect(migration.success).toBe(true);
    const entries = manifestSchema.parse(
      JSON.parse(await readFile(manifest, "utf8")),
    ).runs[0]?.entries;
    expect(entries).toContainEqual(
      expect.objectContaining({ id: "failed", outcome: "cleared" }),
    );
    expect(entries).toContainEqual(
      expect.objectContaining({ id: "failed-real", outcome: "migrated" }),
    );
    const after = openOfflineEntityDatabase(path).client;
    try {
      const failed = await after.execute(
        "SELECT content, metadata FROM entities WHERE id = 'failed'",
      );
      expect(failed.rows[0]?.["content"]).toBe("");
      expect(JSON.parse(String(failed.rows[0]?.["metadata"]))).toEqual({
        status: "failed",
      });
    } finally {
      after.close();
    }

    const verify = await runAssetsVerify("/", { database: path }, stopped);
    expect(verify.success).toBe(true);
  });
});
