import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openOfflineEntityDatabase } from "@brains/entity-service";
import { migrateEntities } from "@brains/entity-service/migrate";
import { createSilentLogger } from "@brains/test-utils";

export const PNG: Buffer = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
  "base64",
);
// A second, distinct image: a GIF header is enough to describe it.
export const GIF: Buffer = Buffer.from(
  "R0lGODlhAQABAIAAAP///wAAACwAAAAAAQABAAACAkQBADs=",
  "base64",
);
export const dataUrl = (type: string, bytes: Buffer): string =>
  `data:image/${type};base64,${bytes.toString("base64")}`;

const directories: string[] = [];

/** Remove every database a test created; call from afterEach. */
export async function removeFixtures(): Promise<void> {
  await Promise.all(
    directories.splice(0).map((path) => rm(path, { recursive: true })),
  );
}

/** A stopped app's entity database with inline images in every state. */
export async function fixture(
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
export async function mainEraFixture(
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

/** No other process holds the database: the app is stopped. */
export const stopped = { findHolders: async (): Promise<number[]> => [] };
