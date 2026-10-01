import { afterEach, describe, expect, it } from "bun:test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import {
  computeAssetDigest,
  createAssetRef,
  openOfflineEntityDatabase,
} from "@brains/entity-service";
import { computeContentHash } from "@brains/utils/hash";
import { z } from "@brains/utils/zod";
import { migrateEntities } from "@brains/entity-service/migrate";
import { createSilentLogger } from "@brains/test-utils";
import { runAssetsMigrate } from "../src/commands/assets-migrate";
import { planImageAssetMigration } from "../src/lib/binary-asset-migration-plan";

const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
  "base64",
);
// A second, distinct image: a GIF header is enough to describe it.
const GIF = Buffer.from(
  "R0lGODlhAQABAIAAAP///wAAACwAAAAAAQABAAACAkQBADs=",
  "base64",
);
const dataUrl = (type: string, bytes: Buffer): string =>
  `data:image/${type};base64,${bytes.toString("base64")}`;

const directories: string[] = [];

afterEach(async () => {
  await Promise.all(
    directories.splice(0).map((path) => rm(path, { recursive: true })),
  );
});

/** A stopped app's entity database with inline images in every state. */
async function fixture(
  rows: Array<[id: string, content: string]>,
  fts: string[] = [],
): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), "assets-migrate-"));
  directories.push(directory);
  const path = join(directory, "brain.db");
  await migrateEntities({ url: `file:${path}` }, createSilentLogger());
  const client = openOfflineEntityDatabase(path).client;
  try {
    await client.execute(
      "CREATE VIRTUAL TABLE IF NOT EXISTS entity_fts USING fts5(entity_id UNINDEXED, entity_type UNINDEXED, content)",
    );
    await Promise.all(
      rows.map(([id, content]) =>
        client.execute({
          sql: "INSERT INTO entities (id, entityType, content, contentHash, created, updated) VALUES (?, 'image', ?, ?, 1, 2)",
          args: [id, content, `hash-${id}`],
        }),
      ),
    );
    await Promise.all(
      fts.map((id) =>
        client.execute({
          sql: "INSERT INTO entity_fts (entity_id, entity_type, content) VALUES (?, 'image', 'inline')",
          args: [id],
        }),
      ),
    );
  } finally {
    client.close();
  }
  return path;
}

/** A database written by main, before the staged asset schema migration. */
async function mainEraFixture(
  rows: Array<[id: string, content: string]>,
): Promise<string> {
  const path = await fixture(rows);
  const client = openOfflineEntityDatabase(path).client;
  try {
    await client.execute("DROP TABLE asset_chunks");
    await client.execute("DROP TABLE assets");
    await client.execute("DROP TABLE asset_uploads");
    await client.execute(
      "CREATE TABLE assets (digest text PRIMARY KEY NOT NULL, bytes blob NOT NULL, size_bytes integer NOT NULL, created integer NOT NULL)",
    );
    await client.execute(
      "DELETE FROM __drizzle_migrations WHERE created_at = (SELECT MAX(created_at) FROM __drizzle_migrations)",
    );
  } finally {
    client.close();
  }
  return path;
}

const manifestSchema = z.object({
  runs: z.array(
    z.object({ entries: z.array(z.record(z.string(), z.unknown())) }),
  ),
});

const stopped = { findHolders: async (): Promise<number[]> => [] };

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
});
