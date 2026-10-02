import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { createAssetRef } from "@brains/assets";
import { createEntityDatabase, ensureFtsTable } from "../src/db";
import {
  readBinaryAssetInventory,
  readInlineBinaryRow,
} from "../src/offline/binary-asset-inventory";
import { assets, assetUploads } from "../src/schema/assets";
import { entities } from "../src/schema/entities";
import {
  createTestEntityDatabase,
  type TestEntityDatabase,
} from "./helpers/test-entity-db";

const storedDigest = "a".repeat(64);

describe("binary asset inventory", () => {
  let database: TestEntityDatabase;
  let connection: ReturnType<typeof createEntityDatabase>;

  beforeEach(async () => {
    database = await createTestEntityDatabase();
    connection = createEntityDatabase(database.config);
    await ensureFtsTable(connection.client);
    const row = (
      id: string,
      entityType: string,
      content: string,
      metadata: Record<string, unknown> = {},
    ): typeof entities.$inferInsert => ({
      id,
      entityType,
      content,
      contentHash: `hash-${id}`,
      metadata,
      visibility: "public",
      created: 1,
      updated: 2,
    });
    await connection.db.insert(entities).values([
      row("b-inline", "image", "data:image/png;base64,AAAA"),
      row("a-inline", "image", "data:image/png;base64,BBBB"),
      row("migrated", "image", createAssetRef(storedDigest)),
      row("pending", "image", "", { status: "pending" }),
      // Written before pending images stopped carrying a 1x1 placeholder.
      row("legacy-failed", "image", "data:image/png;base64,CCCC", {
        status: "failed",
      }),
      row("note-1", "note", "# Note"),
    ]);
    await connection.client.execute(
      "INSERT INTO entity_fts (entity_id, entity_type, content) VALUES ('a-inline', 'image', 'data'), ('note-1', 'note', 'Note')",
    );
    await connection.db
      .insert(assetUploads)
      .values({ uploadId: "upload-1", created: 1 });
    await connection.db.insert(assets).values({
      digest: storedDigest,
      uploadId: "upload-1",
      sizeBytes: 3,
      chunkCount: 1,
      created: 1,
    });
  });

  afterEach(async () => {
    connection.client.close();
    await database.cleanup();
  });

  it("separates inline rows from references and counts what migration removes", async () => {
    const inventory = await readBinaryAssetInventory(
      connection.client,
      "image",
    );

    expect(inventory).toEqual({
      inlineIds: ["a-inline", "b-inline"],
      awaitingIds: ["legacy-failed", "pending"],
      placeholderIds: ["legacy-failed"],
      referenceCount: 1,
      ftsRows: 1,
      storedDigests: new Set([storedDigest]),
    });
  });

  it("reads one inline row at a time and nothing already migrated", async () => {
    expect(
      await readInlineBinaryRow(connection.client, "image", "a-inline"),
    ).toEqual({
      id: "a-inline",
      content: "data:image/png;base64,BBBB",
      contentHash: "hash-a-inline",
    });
    expect(
      await readInlineBinaryRow(connection.client, "image", "migrated"),
    ).toBeNull();
  });

  it("counts no full-text rows in a database that never built its index", async () => {
    await connection.client.execute("DROP TABLE entity_fts");

    expect(
      (await readBinaryAssetInventory(connection.client, "image")).ftsRows,
    ).toBe(0);
  });
});
