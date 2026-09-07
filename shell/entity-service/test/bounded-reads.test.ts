import { afterEach, beforeEach, describe, expect, it, spyOn } from "bun:test";
import { createTestEntity } from "../src/test";
import {
  setupEntityService,
  type EntityServiceTestContext,
} from "./helpers/setup-entity-service";
import { minimalTestAdapter, minimalTestSchema } from "./helpers/test-schemas";
import { MOCK_DIMENSIONS } from "./helpers/mock-services";
import { createEntityDatabase } from "../src/db";
import { ContentResolver } from "../src/lib/content-resolver";

const readBudget = { rows: 1, rowBytes: 1000, queryCharacters: 40 };
describe("bounded entity reads", () => {
  let ctx: EntityServiceTestContext;
  beforeEach(async () => {
    ctx = await setupEntityService([
      { name: "test", schema: minimalTestSchema, adapter: minimalTestAdapter },
    ]);
  });
  afterEach(async () => {
    await ctx.cleanup();
  });

  it("rejects oversized content and metadata before adapters see the rows", async () => {
    const large = createTestEntity("test", {
      id: "large",
      content: "quokka".repeat(1000),
    });
    const metadata = createTestEntity("test", {
      id: "metadata",
      content: "quokka",
      metadata: { padding: "x".repeat(5000) },
    });
    const small = createTestEntity("test", { id: "small", content: "quokka" });
    const hidden = createTestEntity("test", {
      id: "hidden",
      content: "quokka",
      visibility: "restricted",
    });
    for (const entity of [large, metadata, small, hidden])
      await ctx.entityService.createEntity({ entity });
    const parser = spyOn(minimalTestAdapter, "fromMarkdown");
    try {
      expect(
        await ctx.entityService.getEntity({
          entityType: "test",
          id: large.id,
          readBudget,
        }),
      ).toBeNull();
      expect(
        await ctx.entityService.getEntity({
          entityType: "test",
          id: metadata.id,
          readBudget,
        }),
      ).toBeNull();
      expect(parser).not.toHaveBeenCalled();
      const rows = await ctx.entityService.listEntities({
        entityType: "test",
        options: { limit: 100, readBudget },
      });
      expect(rows.map((row) => row.id)).toEqual([small.id]);
      expect(parser).toHaveBeenCalledTimes(1);
      expect(
        await ctx.entityService.getEntity({ entityType: "test", id: large.id }),
      ).not.toBeNull();
    } finally {
      parser.mockRestore();
    }
  });

  it("does not expand embedded images or perform source work after cancellation", async () => {
    const entity = createTestEntity("test", {
      content: "![image](entity://image/large)",
    });
    await ctx.entityService.createEntity({ entity });
    const resolver = spyOn(ContentResolver.prototype, "resolve");
    const parser = spyOn(minimalTestAdapter, "fromMarkdown");
    try {
      const request = { entityType: "test", id: entity.id, readBudget };
      const bounded = await ctx.entityService.getEntity(request);
      expect(bounded?.content).toBe(entity.content);
      expect(resolver).not.toHaveBeenCalled();
      parser.mockClear();
      const signal = AbortSignal.abort();
      expect(
        await ctx.entityService
          .getEntity({ ...request, signal })
          .catch(() => null),
      ).toBeNull();
      expect(
        await ctx.entityService
          .listEntities({ entityType: "test", options: { readBudget, signal } })
          .catch(() => null),
      ).toBeNull();
      expect(
        await ctx.entityService
          .search({ query: "image", options: { readBudget, signal } })
          .catch(() => null),
      ).toBeNull();
      expect(parser).not.toHaveBeenCalled();
      await ctx.entityService.getEntity({ entityType: "test", id: entity.id });
      expect(resolver).toHaveBeenCalledTimes(1);
    } finally {
      resolver.mockRestore();
      parser.mockRestore();
    }
  });

  it("rejects anomalous timestamp storage instead of treating text payloads as integers", async () => {
    const entity = createTestEntity("test", { content: "small" });
    await ctx.entityService.createEntity({ entity });
    const { client } = createEntityDatabase(ctx.dbConfig);
    const parser = spyOn(minimalTestAdapter, "fromMarkdown");
    try {
      await client.execute({
        sql: "UPDATE entities SET created = ? WHERE id = ?",
        args: ["x".repeat(2000), entity.id],
      });
      expect(
        await ctx.entityService.getEntity({
          entityType: "test",
          id: entity.id,
          readBudget,
        }),
      ).toBeNull();
      expect(parser).not.toHaveBeenCalled();
    } finally {
      parser.mockRestore();
      client.close();
    }
  });

  it("counts UTF-8 bytes across all stored text columns at the exact boundary", async () => {
    const entity = createTestEntity("test", {
      content: "quokka 🦘 é",
      metadata: { title: "洞" },
    });
    await ctx.entityService.createEntity({ entity });
    const { client } = createEntityDatabase(ctx.dbConfig);
    try {
      const result = await client.execute({
        sql: "SELECT length(cast(id AS blob)) + length(cast(entityType AS blob)) + length(cast(content AS blob)) + length(cast(contentHash AS blob)) + length(cast(metadata AS blob)) + length(cast(visibility AS blob)) + 16 AS bytes FROM entities WHERE id = ?",
        args: [entity.id],
      });
      const bytes = Number(result.rows[0]?.["bytes"]);
      expect(Number.isSafeInteger(bytes)).toBe(true);
      expect(
        await ctx.entityService.getEntity({
          entityType: "test",
          id: entity.id,
          readBudget: { ...readBudget, rowBytes: bytes - 1 },
        }),
      ).toBeNull();
      expect(
        await ctx.entityService.getEntity({
          entityType: "test",
          id: entity.id,
          readBudget: { ...readBudget, rowBytes: bytes },
        }),
      ).not.toBeNull();
    } finally {
      client.close();
    }
  });

  for (const embeddingsEnabled of [true, false]) {
    it(`bounds ${embeddingsEnabled ? "semantic" : "lexical"} results at SQL selection`, async () => {
      await ctx.cleanup();
      ctx = await setupEntityService(
        [
          {
            name: "test",
            schema: minimalTestSchema,
            adapter: minimalTestAdapter,
          },
        ],
        { embeddingsEnabled },
      );
      const large = createTestEntity("test", {
        id: "large",
        content: "quokka ".repeat(1000),
      });
      const a = createTestEntity("test", { id: "a", content: "quokka A" });
      const b = createTestEntity("test", { id: "b", content: "quokka B" });
      for (const entity of [large, a, b]) {
        await ctx.entityService.createEntity({ entity });
        if (embeddingsEnabled)
          await ctx.entityService.storeEmbedding({
            entityId: entity.id,
            entityType: "test",
            embedding: new Float32Array(MOCK_DIMENSIONS).fill(0.1),
            contentHash: entity.contentHash,
          });
      }
      const parser = spyOn(minimalTestAdapter, "fromMarkdown");
      try {
        const results = await ctx.entityService.search({
          query: "quokka",
          options: { readBudget, limit: 100 },
        });
        expect(results).toHaveLength(1);
        expect(results[0]?.entity.id).not.toBe(large.id);
        expect(parser).toHaveBeenCalledTimes(1);
      } finally {
        parser.mockRestore();
      }
    });
  }
});
