import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { computeAssetDigest, createAssetRef } from "@brains/assets";
import { ensureFtsTable } from "../src/db";
import { openOfflineEntityDatabase } from "../src/offline/binary-asset-inventory";
import { OfflineBinaryMigrator } from "../src/offline/binary-asset-migration";
import { verifyAssetBackedRows } from "../src/offline/binary-asset-verification";
import {
  createTestEntityDatabase,
  type TestEntityDatabase,
} from "./helpers/test-entity-db";

const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
  "base64",
);
const ref = createAssetRef(computeAssetDigest(PNG));

describe("verifyAssetBackedRows", () => {
  let database: TestEntityDatabase;
  let connection: ReturnType<typeof openOfflineEntityDatabase>;

  async function insertImage(id: string, content: string): Promise<void> {
    await connection.client.execute({
      sql: "INSERT INTO entities (id, entityType, content, contentHash, metadata, created, updated) VALUES (?, 'image', ?, ?, '{}', 1, 2)",
      args: [id, content, `hash-${id}`],
    });
  }

  async function migrate(id: string): Promise<void> {
    await insertImage(id, `data:image/png;base64,${PNG.toString("base64")}`);
    await new OfflineBinaryMigrator(connection).migrateRow("image", {
      id,
      expectedContentHash: `hash-${id}`,
      bytes: PNG,
      expectedSize: PNG.byteLength,
      metadata: { mediaType: "image/png", sizeBytes: PNG.byteLength },
    });
  }

  beforeEach(async () => {
    database = await createTestEntityDatabase();
    connection = openOfflineEntityDatabase(
      database.config.url.slice("file:".length),
    );
    await ensureFtsTable(connection.client);
  });

  afterEach(async () => {
    connection.client.close();
    await database.cleanup();
  });

  it("confirms migrated rows resolve to intact assets", async () => {
    await migrate("cover");
    await migrate("cover-copy");

    expect(await verifyAssetBackedRows(connection, "image")).toEqual({
      rows: [
        { id: "cover", ref, status: "valid" },
        { id: "cover-copy", ref, status: "valid" },
      ],
      inlineRows: 0,
      placeholderRows: 0,
      ftsRows: 0,
    });
  });

  it("names a reference with no published asset", async () => {
    await insertImage("orphan", ref);

    const result = await verifyAssetBackedRows(connection, "image");

    expect(result.rows).toEqual([{ id: "orphan", ref, status: "missing" }]);
  });

  it("names an asset whose stored chunks no longer match its digest", async () => {
    await migrate("cover");
    await connection.client.execute(
      "UPDATE asset_chunks SET bytes = zeroblob(length(bytes))",
    );

    const result = await verifyAssetBackedRows(connection, "image");

    expect(result.rows[0]).toMatchObject({ id: "cover", status: "corrupt" });
  });

  it("names an asset with a missing chunk", async () => {
    await migrate("cover");
    await connection.client.execute("DELETE FROM asset_chunks");

    const result = await verifyAssetBackedRows(connection, "image");

    expect(result.rows[0]).toMatchObject({ id: "cover", status: "corrupt" });
  });

  it("names a row whose recorded size disagrees with its asset", async () => {
    await migrate("cover");
    await connection.client.execute(
      "UPDATE entities SET metadata = json_set(metadata, '$.sizeBytes', 1)",
    );

    const result = await verifyAssetBackedRows(connection, "image");

    expect(result.rows[0]).toMatchObject({
      id: "cover",
      status: "size-mismatch",
    });
  });

  it("counts inline rows and full-text rows still left", async () => {
    await insertImage("inline", "data:image/png;base64,AAAA");
    await connection.client.execute(
      "INSERT INTO entity_fts (entity_id, entity_type, content) VALUES ('inline', 'image', 'x')",
    );

    const result = await verifyAssetBackedRows(connection, "image");

    expect(result).toMatchObject({ rows: [], inlineRows: 1, ftsRows: 1 });
  });
});
