import { afterEach, describe, expect, test } from "bun:test";
import { createTestEntityDatabase } from "./helpers/test-entity-db";
import { createEntityDatabase } from "../src/db";
import { entities } from "../src/schema/entities";
import { embeddings } from "../src/schema/embeddings";
import { computeContentHash } from "@brains/utils/hash";
import { MOCK_DIMENSIONS } from "./helpers/mock-services";

const cleanups: Array<() => Promise<void>> = [];

afterEach(async () => {
  await Promise.all(cleanups.splice(0).map((cleanup) => cleanup()));
});

describe("embedding schema", () => {
  test("stores embeddings in the entity database with a composite cascade", async () => {
    const testDb = await createTestEntityDatabase();
    cleanups.push(testDb.cleanup);
    const { db, client } = createEntityDatabase(testDb.config);
    await client.execute("PRAGMA foreign_keys = ON");

    const contentHash = computeContentHash("schema test");
    await db.insert(entities).values({
      id: "one",
      entityType: "test",
      content: "schema test",
      contentHash,
      metadata: {},
      created: 1,
      updated: 1,
    });
    await db.insert(embeddings).values({
      entityId: "one",
      entityType: "test",
      embedding: new Float32Array(MOCK_DIMENSIONS).fill(0.25),
      contentHash,
    });

    const foreignKeys = await client.execute(
      "PRAGMA foreign_key_list(embeddings)",
    );
    expect(foreignKeys.rows).toHaveLength(2);
    expect(
      foreignKeys.rows.every((row) => row["on_delete"] === "CASCADE"),
    ).toBe(true);

    await db.delete(entities);
    const rows = await db.select().from(embeddings);
    expect(rows).toEqual([]);
    client.close();
  });

  test("rejects orphan embeddings", async () => {
    const testDb = await createTestEntityDatabase();
    cleanups.push(testDb.cleanup);
    const { db, client } = createEntityDatabase(testDb.config);
    await client.execute("PRAGMA foreign_keys = ON");

    let rejected = false;
    try {
      await db.insert(embeddings).values({
        entityId: "missing",
        entityType: "test",
        embedding: new Float32Array(MOCK_DIMENSIONS),
        contentHash: "missing",
      });
    } catch {
      rejected = true;
    }
    expect(rejected).toBe(true);

    client.close();
  });
});
