import { afterEach, describe, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { assetRefSchema, getAssetDigest } from "@brains/assets";
import { runBinaryAssetMigration } from "../src/commands/migrate-binary-assets";
import { runAssetReconciliation } from "../src/commands/reconcile-assets";

const TINY_PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
const TINY_PNG_DATA_URL = `data:image/png;base64,${TINY_PNG_BASE64}`;
const temporaryDirectories: string[] = [];

interface StoredImage {
  content: string;
  contentHash: string;
  metadata: string;
  visibility: string;
  created: number;
  updated: number;
}

function createFixture(content = TINY_PNG_DATA_URL): {
  directory: string;
  databasePath: string;
  assetDirectory: string;
  stateDirectory: string;
} {
  const directory = mkdtempSync(join(tmpdir(), "binary-asset-command-"));
  temporaryDirectories.push(directory);
  writeFileSync(
    join(directory, "brain.yaml"),
    "brain: brain\nbundles:\n  - core\n",
  );
  const databasePath = join(directory, "brain.db");
  const database = new Database(databasePath, { create: true, strict: true });
  database.exec(`
    CREATE TABLE entities (
      id TEXT NOT NULL,
      entityType TEXT NOT NULL,
      content TEXT NOT NULL,
      contentHash TEXT NOT NULL,
      visibility TEXT NOT NULL,
      metadata TEXT NOT NULL,
      created INTEGER NOT NULL,
      updated INTEGER NOT NULL,
      PRIMARY KEY (id, entityType)
    );
    CREATE VIRTUAL TABLE entity_fts USING fts5(
      entity_id UNINDEXED,
      entity_type UNINDEXED,
      content
    );
  `);
  database
    .query(
      `INSERT INTO entities
        (id, entityType, content, contentHash, visibility, metadata, created, updated)
       VALUES ('hero', 'image', ?, 'legacy-hash', 'restricted', ?, 100, 200)`,
    )
    .run(
      content,
      JSON.stringify({
        title: "Hero",
        sourceUrl: "https://example.com/hero.png",
      }),
    );
  database.exec(
    "INSERT INTO entity_fts (entity_id, entity_type, content) VALUES ('hero', 'image', 'legacy')",
  );
  database.close(false);
  return {
    directory,
    databasePath,
    assetDirectory: join(directory, "assets"),
    stateDirectory: join(directory, "migration-state"),
  };
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("brain migrate binary-assets", () => {
  test("dry-run reports migration facts without writing assets or entities", async () => {
    const fixture = createFixture();

    const result = await runBinaryAssetMigration(fixture.directory, {
      entityType: "image",
      dryRun: true,
      databaseUrl: `file:${fixture.databasePath}`,
      assetDirectory: fixture.assetDirectory,
      stateDirectory: fixture.stateDirectory,
    });

    expect(result.success).toBe(true);
    expect(result.message).toContain("Legacy rows: 1");
    expect(result.message).toContain("Expected content-hash changes: 1");
    expect(existsSync(fixture.assetDirectory)).toBe(false);
    expect(existsSync(fixture.stateDirectory)).toBe(false);
    const database = new Database(fixture.databasePath, { strict: true });
    const row = database
      .query<{ content: string }, []>("SELECT content FROM entities")
      .get();
    database.close(false);
    expect(row?.content).toBe(TINY_PNG_DATA_URL);
  });

  test("migrates atomically, writes a safe manifest, and verifies", async () => {
    const fixture = createFixture();
    const options = {
      entityType: "image",
      databaseUrl: `file:${fixture.databasePath}`,
      assetDirectory: fixture.assetDirectory,
      stateDirectory: fixture.stateDirectory,
    };

    const migrated = await runBinaryAssetMigration(fixture.directory, options);

    expect(migrated.success).toBe(true);
    expect(migrated.message).toContain("Migrated rows: 1");
    const database = new Database(fixture.databasePath, { strict: true });
    const row = database.query<StoredImage, []>("SELECT * FROM entities").get();
    const fts = database
      .query<{ count: number }, []>(
        "SELECT count(*) AS count FROM entity_fts WHERE entity_type = 'image'",
      )
      .get();
    database.close(false);
    const ref = assetRefSchema.parse(row?.content);
    expect(row).toMatchObject({
      visibility: "restricted",
      created: 100,
      updated: 200,
    });
    expect(JSON.parse(row?.metadata ?? "{}")).toMatchObject({
      title: "Hero",
      sourceUrl: "https://example.com/hero.png",
      format: "png",
      mediaType: "image/png",
      width: 1,
      height: 1,
    });
    expect(fts?.count).toBe(0);
    expect(
      existsSync(join(fixture.assetDirectory, "sha256", getAssetDigest(ref))),
    ).toBe(true);

    const manifestPath = join(
      fixture.stateDirectory,
      "image-migration-manifest.json",
    );
    const manifest = readFileSync(manifestPath, "utf8");
    expect(manifest).not.toContain("data:image/");
    expect(manifest).not.toContain("base64");
    expect(manifest).not.toContain("asset://");

    const rerun = await runBinaryAssetMigration(fixture.directory, options);
    expect(rerun.success).toBe(true);
    expect(rerun.message).toContain("Migrated rows: 0");
    expect(readFileSync(manifestPath, "utf8")).toBe(manifest);

    const verified = await runBinaryAssetMigration(fixture.directory, {
      ...options,
      verify: true,
    });
    expect(verified.success).toBe(true);
    expect(verified.message).toContain("Verified rows: 1");

    const assetPath = join(
      fixture.assetDirectory,
      "sha256",
      getAssetDigest(ref),
    );
    rmSync(assetPath);
    const sourceDirectory = join(fixture.directory, "brain-data", "image");
    mkdirSync(sourceDirectory, { recursive: true });
    writeFileSync(
      join(sourceDirectory, "hero.png"),
      Buffer.from(TINY_PNG_BASE64, "base64"),
    );
    const reconciled = await runAssetReconciliation(fixture.directory, {
      entityType: "image",
      from: "brain-data",
      databaseUrl: options.databaseUrl,
      assetDirectory: options.assetDirectory,
    });
    expect(reconciled.success).toBe(true);
    expect(reconciled.message).toContain("Restored assets: 1");
    expect(existsSync(assetPath)).toBe(true);
  });

  test("fails closed on malformed rows before creating assets", async () => {
    const fixture = createFixture("data:image/png;base64,not-valid");

    const result = await runBinaryAssetMigration(fixture.directory, {
      entityType: "image",
      databaseUrl: `file:${fixture.databasePath}`,
      assetDirectory: fixture.assetDirectory,
      stateDirectory: fixture.stateDirectory,
    });

    expect(result.success).toBe(false);
    expect(result.message).toContain("invalid-or-corrupt");
    expect(existsSync(fixture.assetDirectory)).toBe(false);
    expect(existsSync(fixture.stateDirectory)).toBe(false);
  });

  test("refuses unsupported entity types and remote databases", async () => {
    const fixture = createFixture();
    const unsupported = await runBinaryAssetMigration(fixture.directory, {
      entityType: "document",
      databaseUrl: `file:${fixture.databasePath}`,
      assetDirectory: fixture.assetDirectory,
      stateDirectory: fixture.stateDirectory,
    });
    const remote = await runBinaryAssetMigration(fixture.directory, {
      entityType: "image",
      databaseUrl: "libsql://database.example.com",
      assetDirectory: fixture.assetDirectory,
      stateDirectory: fixture.stateDirectory,
    });

    expect(unsupported.success).toBe(false);
    expect(unsupported.message).toContain("currently supports only image");
    expect(remote.success).toBe(false);
    expect(remote.message).toContain("local file: SQLite");
  });
});
