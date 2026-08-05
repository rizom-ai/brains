import { afterEach, describe, expect, test } from "bun:test";
import { createClient, type Client } from "@libsql/client";
import { createTestEntity } from "@brains/test-utils";
import type { EntityTypeConfig } from "../src";
import {
  setupEntityService,
  type EntityServiceTestContext,
} from "./helpers/setup-entity-service";
import { minimalTestAdapter, minimalTestSchema } from "./helpers/test-schemas";

describe("EntityTypeConfig fullTextSearchable", () => {
  let ctx: EntityServiceTestContext | undefined;
  let client: Client | undefined;

  afterEach(async () => {
    client?.close();
    await ctx?.cleanup();
    client = undefined;
    ctx = undefined;
  });

  async function setup(config?: EntityTypeConfig): Promise<void> {
    ctx = await setupEntityService([
      {
        name: "test",
        schema: minimalTestSchema,
        adapter: minimalTestAdapter,
        ...(config && { config }),
      },
    ]);
    client = createClient({ url: ctx.dbConfig.url });
  }

  async function ftsRows(entityId: string): Promise<number> {
    if (!client) throw new Error("Test database not initialized");
    const result = await client.execute({
      sql: "SELECT count(*) AS count FROM entity_fts WHERE entity_type = ? AND entity_id = ?",
      args: ["test", entityId],
    });
    return Number(result.rows[0]?.["count"] ?? 0);
  }

  test("indexes entity types by default", async () => {
    await setup();
    if (!ctx) throw new Error("Test service not initialized");
    const entity = createTestEntity("test", {
      id: "searchable",
      content: "ordinary searchable text",
    });

    await ctx.entityService.createEntity({ entity });

    expect(await ftsRows(entity.id)).toBe(1);
  });

  test("skips FTS insertion for excluded entity types", async () => {
    await setup({
      embeddable: false,
      fullTextSearchable: false,
    });
    if (!ctx) throw new Error("Test service not initialized");
    const entity = createTestEntity("test", {
      id: "asset-backed",
      content: "asset://sha256/" + "a".repeat(64),
    });

    await ctx.entityService.createEntity({ entity });

    expect(await ftsRows(entity.id)).toBe(0);
    expect(ctx.entityRegistry.getEntityTypeConfig("test")).toMatchObject({
      embeddable: false,
      fullTextSearchable: false,
    });
  });

  test("leaves a searchable entity's FTS row untouched on a no-op update", async () => {
    await setup();
    if (!ctx || !client) throw new Error("Test service not initialized");
    const entity = createTestEntity("test", {
      id: "idempotent-write",
      content: "ordinary searchable text",
    });
    await ctx.entityService.createEntity({ entity });
    const before = await client.execute({
      sql: "SELECT rowid FROM entity_fts WHERE entity_type = ? AND entity_id = ?",
      args: ["test", entity.id],
    });

    const result = await ctx.entityService.updateEntity({ entity });

    // A rewritten row gets a new rowid. Idempotent writes must not pay for a
    // delete/insert of the full serialized content.
    const after = await client.execute({
      sql: "SELECT rowid FROM entity_fts WHERE entity_type = ? AND entity_id = ?",
      args: ["test", entity.id],
    });
    expect(result.skipped).toBe(true);
    expect(await ftsRows(entity.id)).toBe(1);
    expect(after.rows[0]?.["rowid"]).toBe(before.rows[0]?.["rowid"]);
  });

  test("deletes a stale FTS row even when an update is otherwise a no-op", async () => {
    await setup({ embeddable: false, fullTextSearchable: false });
    if (!ctx || !client) throw new Error("Test service not initialized");
    const entity = createTestEntity("test", {
      id: "stale-index-row",
      content: "asset://sha256/" + "b".repeat(64),
    });
    await ctx.entityService.createEntity({ entity });
    await client.execute({
      sql: "INSERT INTO entity_fts (entity_id, entity_type, content) VALUES (?, ?, ?)",
      args: [entity.id, entity.entityType, "legacy binary payload"],
    });
    expect(await ftsRows(entity.id)).toBe(1);

    const result = await ctx.entityService.updateEntity({ entity });

    expect(result.skipped).toBe(true);
    expect(await ftsRows(entity.id)).toBe(0);
  });
});
